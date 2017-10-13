"use strict";
var request = require('request');
var rp = require('request-promise');
var redis = require("ioredis");
var fs = require('fs');
var path = require('path');
var config = require('./config.json');

var Model = function(){
  this.r_c = redis.createClient();

  this.img_dir = "/tmp/t3_img";
  this.thumb_dir = "/tmp/t3_thumb";

  if (!fs.existsSync(this.thumb_dir))
    fs.mkdirSync(this.img_dir, 0o744);
  if (!fs.existsSync(this.thumb_dir))
    fs.mkdirSync(this.thumb_dir, 0o744);

  this.pools = {};

  //this.subreddits = Object.keys(this.subreddit_pool);
};

Model.prototype.select_db = async function(dbid){
  return new Promise ((res,rej) => {
    this.r_c.select(dbid, ()=>{res()})
  })
}



Model.prototype.add_subreddit_pool = function(name, subreddits){
  let pool = new this.Pool(this, name, subreddits);
  this.pools[name] = pool;
}

Model.prototype.Pool = function(m, name, subreddits){
  this.model = m;
  this.subreddits = subreddits;
  this.name = name;
  this.t3_set_key = "pool_"+ this.name+"_set";
  this.t3_hash_key = "pool_"+ this.name+"_hash";

  let selektion_increment = 0;


  this.rand_subreddit_url = function(){
    var sr_names = Object.keys(this.subreddits);
    var s = sr_names[Math.floor(Math.random()*sr_names.length)];
    //"https://www.reddit.com/r/ImaginaryMindscapes/top.json?limit=25&sort=top&t=all",
    var url;
    if (Math.random() > .5)
      url = "https://www.reddit.com/r/"+s+"/top.json?limit=100&sort=top&t=all";
    else
      url = "https://www.reddit.com/r/"+s+"/.json?limit=100";
    return url;
  };
  this.refresh_selektion = function(dims, excludes){
    // temporary keys like t3_selektor_birdpics_2342
    let selektion_key = 't3_selektor_' + this.name  + selektion_increment;
    selektion_increment++;
    return new Promise( (reso,rej) => {
      if (!dims)
        rej('no dims')
      this.scrape_if_timely().then( () => {
        this.model.r_c.srandmember(this.t3_set_key, 100, (err,t3ids) => {
          if(err) {rej(err+".vbvbvb");return};
          this.model.r_c.hmget(this.t3_hash_key, t3ids, (err,t3s) => {
            if(err) {rej(err+".8d8d8d");return};
            for (let i=0; i < t3s.length; i++)
              t3s[i] = JSON.parse(t3s[i]);

            //filter out nsfw and other undesirables
            var undesirables = t3s.filter(t3=> !t3_desirable(t3));
            for (let t3 of undesirables){
              this.purge_t3(t3);
            };
            t3s = t3s.filter( t3_desirable);
            var asp = normalize(dims);
            //figure out how much we like each image, based on a few factors.
            for(let t3 of t3s){
              let karma_fitness = Math.pow (Math.log2(t3.data.score), 2.3);

              //multiply score by aspect ratio fitness.
              //square or cube the dot product of the normalized dimensions of game screen & image.
              //for more divergent dims, the dimensional fitness will go to 0 faster.
              t3.dims = [t3.data.preview.images[0].source.width, t3.data.preview.images[0].source.height];
              t3.asp = normalize(t3.dims);
              let dimensional_fitness = Math.pow(dot(asp, t3.asp), 11); // TODO: some sort of sigmoid?
              if (dimensional_fitness < .5)
                dimensional_fitness = .001; //bleh, no tweaks will be enough;

              //bias toward newer images.
              //floor newness fitness at 0.1
              let degradation_unit = 60*60*24*7 * 1; //1 week
              let timestamp = t3.data.created_utc;
              let now = new Date();
              let age_in_seconds = Math.abs( now/1000 - timestamp);
              let newness_fitness = 1 / (.5 +(age_in_seconds / (degradation_unit)));
              newness_fitness += .1;
              //1.45 is 3 days ago, 0.84=11 days, 0.29=2 months, 0.11=23 months, etc.

              let subreddit_bias = this.subreddits[t3.data.subreddit].bias;

              t3.myscore = karma_fitness * dimensional_fitness * newness_fitness * subreddit_bias;
            }

            let totscore = 0;
            for(let t3 of t3s){
              totscore += t3.myscore;
            }
            let promises = [];
            let score = 0;
            for(let t3 of t3s){
              promises.push(new Promise( (rs,rj) => {
                score += t3.myscore / totscore;
                this.model.r_c.zadd(selektion_key, score, t3.data.id, ()=> {rs()});
              }));
            }
            Promise.all(promises).then( () => {
              //set our sorted set to expire after use.
              this.model.r_c.expire(selektion_key, 10);
              reso(selektion_key);
            }).catch( err => {console.log("blah!",err);rej(err + '.selektion-failure')});
          });
        });
      }).catch (err => {rej(err + '.scrape-fail')});
    });
  };
  // this returns duplicates.
  this.weighted_t3_selektion = function(n, dims){
    return new Promise( (reso,rej)=>{
      this.refresh_selektion(dims).then( selektion_key => {
        let promises = [];
        for (let i=0;i<n;i++){
          promises.push( new Promise ((rs,rj) => {
            //this returns an array, even when it's of one.
            this.model.r_c.zrangebyscore(selektion_key, Math.random()*.9, 999, 'LIMIT', 0, 1, (err,t3) => {rs(t3[0])} );
          }));
        }
        Promise.all(promises).then( selektion => {
          reso(selektion);
        }).catch( err => {rej(err + '.pgpgpg')});;
      }).catch(err => {rej(err + '.selektion-fail')});
    });
  };
  this.scrape = function(){
    console.log('SCRAPE engaged!');
    let url = this.rand_subreddit_url();
    return new Promise ( (reso,rej) => {
      let rp_opts = {
        "uri" : url,
        "headers": {
          "User-Agent": "foog.us jigsaw server",
        }
      };
      rp(rp_opts).then( json => {
        var subreddit_page = JSON.parse(json);

        var t3s = subreddit_page.data.children;
        if (t3s.length < 3){
          rej('whaaaat? url ' + url + ' returned:'+ "\n\n\n\n\n"+ json); return;
        }
        console.log('SCRAPE gives '+t3s.length+ ' t3s from '+ url);
        for (let t3 of t3s){
          if (t3.data.url.match(/\.gif|gallery|album/))
            continue;

          //translate imgur to i.imgur, also resolve flickr & deviantart
          //TODO: what if http://imgur.com/AsDfGhJk or whatever is an animated gif? I dont even know
          t3.orig_url = t3.data.url; // it may change from a page url.
          let should_resolve_url_regex = new RegExp(
            da_url_regex.source + '|' +
            flickr_url_regex.source + '|' +
            imgur_page_url_regex.source
          );
          if (should_resolve_url_regex.test(t3.data.url)){
            t3.data.url = this.model.resolve_pic_url(t3.data.url);
          }

          // run a bunch of filters: nsfw, jpg, score, size, etc.
          if(!t3_desirable(t3))
            continue;
          //re-insert. some data changes, such as reddit karma.
          let hundred_promises = [];
          hundred_promises.push(new Promise( (resx,rejx) => {
            this.model.r_c.hget('purged_t3', t3.data.id, (is_purged) => {
              if (!is_purged){
                this.model.r_c.hset(this.t3_hash_key, t3.data.id, JSON.stringify(t3));
                this.model.r_c.sadd(this.t3_set_key, t3.data.id, () => { // for random selection
                  resx();
                });
              }
              else { resx(); } // t3 already evaluated.
            });
          }));
          Promise.all(hundred_promises).then(
            values => {reso( {scraped : "yes"} ) } 
          ).catch(err => {rej(err + '.one of a hundred promises failed?')});
        }
      }).catch( err => {rej(err + '.||||')});;
    });
  };
  this.scrape_if_timely = function(){
    let d = new Date();
    let d_seconds = Math.round(d.getTime() / 1000);
    let last_scrape_key = 'pool_'+this.name+ '_last_scrape';
    return new Promise( (reso,rej) => {
      this.model.r_c.get(last_scrape_key, (err,t) => {
        if(t===null) t=0;
        else t = parseInt(t);
        if (t + 1000 > d_seconds){
          reso( {scraped: "no"} );
          return;
        }
        this.model.r_c.set(last_scrape_key, d_seconds);
        let scrape_promise = this.scrape();
        scrape_promise.then( result => {
          reso( {scraped: "yes", scrape : result} );
          return;
        }).catch( err => {rej(err + '.timely-scrape-failed')});;
      });
    });
  };
}
  



//input the t3 hash or just the t3id
Model.prototype.purge_t3 = function(t3){
  let t3id = t3;
  if (typeof t3 == "object")
    t3id = t3.data.id;
  this.r_c.hdel('t3',t3id);
  this.r_c.srem('t3_set', t3id);
  this.r_c.hset('purged_t3', t3id, 1);
  console.log('purged '+t3id);
}
function t3_desirable (t3){
  if(t3.data.thumbnail === 'self') // filter out self posts
    return false;
  if(t3.data.thumbnail === 'nsfw') // someone gets paid to play games at work.
    return false;
  if(t3.data.preview === undefined) // prolly 404, or I think other undesirables.
    return false;
  if(t3.data.score <= 15) // we want variety but we dont want crap
    return false;
  if(/quotes/i.exec(t3.data.title)) // filter out quotes porn
    return false;
  if(t3.data.preview.images[0].source.width * t3.data.preview.images[0].source.height > 9000000) //filter out hubble deep field, please
    return false;
  if(!/\.jpg/.exec(t3.data.url)) // filter out stuff that is not a jpeg
    return false;
  return true;
};

function normalize(p){
  var magnitude = Math.sqrt(p[0]*p[0] + p[1]*p[1]);
  return [p[0]/magnitude, p[1]/magnitude];
};
function dot(p1,p2){
  return p1[0]*p2[0] + p1[1]*p2[1];
}




var pic_requests = {};

//just resolves positive without downloading if it's at fspath already
Model.prototype.download_pic = function(pic_url, fspath){
  return new Promise((reso,rej) => {
    if (pic_requests[fspath]){
      reso();
      return;
    }
    //see if we have it now in filesystem
    var stat = fs.stat(fspath, (err,stats) => {
      if (!err){
        reso();
        return;
      }
      console.log('getting pic at ' + pic_url);
      var r = request.get(pic_url);
      r.on('error', err => {
        //console.log(err)
        rej(err.toString());
      });
      r.on('response', resp => {
        if(resp.statusCode === 200){
          if (resp.request.uri.href != pic_url){ //redirected, could be a 'not found' image
            this.r_c.rpush('redirect_log', JSON.stringify({from:pic_url, to:resp.request.uri.href}));
            console.log('redirection logged!');
            if (resp.request.uri.href == "http://i.imgur.com/removed.png" || 
                resp.request.uri.href == 'https://s.yimg.com/pw/images/en-us/photo_unavailable.png'){
              rej('host-removed-png.');
              return;
            }
          }
          var w = fs.createWriteStream(fspath);
          r.pipe(w);
          w.on('open', ()=>{});
          w.on('finish', ()=> {
            reso();
            delete pic_requests[fspath];
          });
        }
        else {
          console.log(pic_url +' request failed: '+ resp.statusCode +', fspath: '+ fspath);
          rej(pic_url +' request failed: '+ resp.statusCode +', fspath: '+ fspath);
        }
      })
    });
  });
};

Model.prototype.fspath_t3pic = function(t3id){
  var filename = t3id + '.jpg';
  var fspath = this.img_dir + '/' + filename;
  return new Promise( (reso,rej) => {
    this.t3_from_db(t3id).then( t3 => {
      var dl_promise = this.download_pic(t3.data.url, fspath);
      dl_promise.then( () => {
        reso(fspath);
      }).catch( (err) => { rej(err + '.pic_dl_failed.'); });
    }).catch ( err => {rej(err + '.fspath_t3pic_failed')});
  });
};

Model.prototype.fspath_t3thumb = function(t3id){
  var filename = t3id + '.jpg';
  var fspath = this.thumb_dir + '/' + filename;
  return new Promise( (reso,rej) => {
    this.t3_from_db(t3id).then( t3 => {
      var dl_promise = this.download_pic(t3.data.thumbnail, fspath);
      dl_promise.then( () => {
        reso(fspath);
      }).catch( (err) => { rej(err + '.thumb_dl_failed.'); });
    }).catch ( err => {rej(err + '.fspath_t3thumb_failed')});
  });
};


Model.prototype.t3_from_db = function(t3id){ //return a promise.
  var p = new Promise( (resolve,rej) => {
    this.r_c.hget('t3', t3id, (err, result) => {
      if (!result){
        rej(t3id + " not found as a t3 in redis");
      }
      else {
        var thing = JSON.parse(result);
        resolve(thing);
      }
    });
  });
  return p;
};


Model.prototype.user_from_json = function(json_stuff){
  var stuff = JSON.parse(json_stuff);
  var u = new this.User(this);
  u.id = stuff.id
  return u;
}
Model.prototype.User = function(m){
  // get a list of all the finished t3's
  this.model = m;
  this.get_fin = () => {
    return new Promise( (resolve, rej) => {
      this.model.r_c.hget('fin_by_user', this.id, (err,res) => {
        if (res === null)
          res = "{}";
        resolve(JSON.parse(res));
      });
    });
  }
  // fin_hash: {t3id : true,...} or {t3id:epochtime,...}
  this.set_fin = (fin_hash) => {
    return new Promise( (reso,rej) => {
      this.model.r_c.hset('fin_by_user', this.id, JSON.stringify(fin_hash));
      reso();
    });
  };

  //mark a t3 as finished by this user.
  //returns the same thing as user.get_fin
  this.fin_t3 = (t3id, val) => {
    if (val === undefined)
      val = true;
    return new Promise( (resolve,rej) => {
      this.get_fin().then( fins=>{
        fins[t3id] = val;
        this.set_fin(fins).then( () => {
          resolve(fins);
        });
      });
    });
  };

  //return a random t3 that hasn't been fin'd by this user
  this.rand_unfinished_t3id = function(dims){
    return new Promise( (reso,rej)=>{
      this.model.pools.default.weighted_t3_selektion(25, dims).then( t3ids => {
        this.get_fin().then ( (fin) => {
          for (let t3id of t3ids){
            if (!fin[t3id]){
              reso(t3id);
              return;
            }
          }
          rej('tried 10, nothing new found');
        });
      }).catch(err => {rej(err + '.rand_t3id_fail')});
    });
  }
  this.rand_unfinished_t3 = function(dims){
    return new Promise( (reso,rej)=>{
      this.rand_unfinished_t3id(dims).then( t3id => {
        if (!t3id){
          console.log('no t3 found for dims:' + dims);
          rej('no t3 found for dims:' + dims);
          return;
        }
        this.model.t3_from_db (t3id)
          .then( t3 => { //return a promise.
            reso(t3);
          })
          .catch( err => {
            rej('t3 getting err: '+ err + '.bifffff');
          });
      }).catch( err => {rej('couldnt get a rand id'+ err + '.mikmik')});;
    });
  };
};


Model.prototype.get_user = function(userid){
  return new Promise( (resolve,reject) => {
    this.r_c.hget('user',userid, (err,user_json) => {
      resolve(this.user_from_json(user_json));
    });
  });
};

Model.prototype.gen_new_user = function(){
  return new Promise( (resolve,reject) => {
    this.r_c.incr('next_userid', (err,nextid) => {
      if(err)
        reject(err + '.asdf9');
      var user = new this.User();
      user.id = nextid;
      this.r_c.hset('user', nextid, JSON.stringify(user));
      resolve(user);
    });
  });
}

// generate a new user if one doesn't exist
Model.prototype.get_user_from_session_id = function(sessid){
  return new Promise( (resolve, reject) => {
    this.r_c.hget('sess_userid', sessid, (err,userid) => {
      if(userid === null)
        this.gen_new_user().then( (user) => {
          this.r_c.hset('sess_userid', sessid, user.id);
          resolve(user);
          return;
        });
      else this.get_user(userid).then( (user) => {resolve(user)});
    });
  });
};

// url resolve
const hostImageResolver = require('host-image-resolver'); //for deviantart
const ImageResolver = require('image-resolver');
let f_resolver = new ImageResolver(); // for flickr
f_resolver.register(new ImageResolver.Flickr(config['flickr-key']));
let imgur_resolver = new ImageResolver();
imgur_resolver.register(new ImageResolver.ImgurPage());

let da_url_regex = new RegExp('https?://.+\.deviantart\.com/art')
let flickr_url_regex = new RegExp('https?://www\.flickr\.com/photos')
let imgur_page_url_regex = new RegExp('https?://imgur\.com/[a-zA-Z0-9]{2,}') //no albums

//cache resolutions in redis hash 'url_resolutions': url to resolved url

Model.prototype.resolve_pic_url = function(url){
  return new Promise ((resolve,reject) => {
    this.r_c.hget('url_resolutions', url, (resolvd_url) => {
      if (resolvd_url)
        resolve(resolvd_url);
      if (da_url_regex.test(url)){
        hostImageResolver(url).then( (da_resolved) => {
          console.log('resolved '+url+' to '+da_resolved[0]);
          this.r_c.hset('url_resolutions', url, da_resolved[0])
          resolve(da_resolved[0]);
        }).catch( err=> {
          reject(err + '.da_rejected')
        });
      }
      else if (flickr_url_regex.test(url)){
        f_resolver.resolve(url, (asdf) => {
          if (asdf == null){
            console.log(url + ' resolution is NULL.');
            reject (url + ' resolution is NULL');
            return;
          }
          console.log('resolved '+url+' to '+asdf.image);
          this.r_c.hset('url_resolutions', url, asdf.image)
          resolve(asdf.image);
        });
      }
      else if (imgur_page_url_regex.test(url)){
        imgur_resolver.resolve(url, asdf => {
          console.log('resolved '+url+' to '+asdf.image);
          this.r_c.hset('url_resolutions', url, asdf.image)
          resolve(asdf.image);
        });
      }
      else {
        console.log(24532432459342);
        reject('dunno about url: '+url)
      }
    });
  });
}


let M = new Model();
M.add_subreddit_pool('default', {
  'ImaginaryBestOf': {bias:35},
  'NoSillySuffix': {bias:20},
  'ImaginaryMindscapes': {bias:20},
  'wallpapers': {bias:5},
  'MostBeautiful': {bias:5},
  'VillagePorn': {bias:10},
  'EarthPorn': {bias:8},
  'nocontextpics': {bias:14},
});
module.exports = M;

