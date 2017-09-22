"use strict";
var request = require('request');
var rp = require('request-promise');
var redis = require("redis");
var r_c = redis.createClient();
var fs = require('fs');
var path = require('path');

var Model = {};
module.exports = Model;

Model.select_db = async function(dbid){
  return new Promise ((res,rej) => {
    r_c.select(dbid, ()=>{res()})
  })
}

Model.subreddit_pool = {
  'ImaginaryBestOf': {bias:35},
  'NoSillySuffix': {bias:20},
  'ImaginaryMindscapes': {bias:20},
  'wallpapers': {bias:5},
  'MostBeautiful': {bias:5},
  'VillagePorn': {bias:10},
  'EarthPorn': {bias:8},
  'nocontextpics': {bias:14},
};
Model.subreddits = Object.keys(Model.subreddit_pool);

Model.rand_subreddit_url = function(){
  var s = Model.subreddits[Math.floor(Math.random()*Model.subreddits.length)];
  //"https://www.reddit.com/r/ImaginaryMindscapes/top.json?limit=25&sort=top&t=all",
  var url;
  if (Math.random() > .5)
    url = "https://www.reddit.com/r/"+s+"/top.json?limit=100&sort=top&t=all";
  else
    url = "https://www.reddit.com/r/"+s+"/.json?limit=100";
  return url;
};

//input the t3 hash or just the t3id
Model.purge_t3 = function(t3){
  let t3id = t3;
  if (typeof t3 == "object")
    t3id = t3.data.id;
  r_c.hdel('t3',t3id);
  r_c.srem('t3_set', t3id);
  r_c.hset('purged_t3', t3id, 1);
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
  if(t3.data.preview.images[0].source.width * t3.data.preview.images[0].source.height > 5000000) //filter out hubble deep field, please
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

let selektion_increment = 0;
Model.refresh_selektion = function(dims){
  let selektion_key = 't3_selektor' + selektion_increment;
  selektion_increment++;
  return new Promise( (reso,rej) => {
    if (!dims)
      rej('no dims')
    Model.scrape_reddit_if_timely().then( () => {
      r_c.srandmember('t3_set', 100, (err,t3ids) => {
        if(err) {rej(err+".vbvbvb");return};
        r_c.hmget('t3', t3ids, (err,t3s) => {
          if(err) {rej(err+".8d8d8d");return};
          for (let i=0; i < t3s.length; i++)
            t3s[i] = JSON.parse(t3s[i]);

          //filter out nsfw and other undesirables
          var undesirables = t3s.filter(t3=> !t3_desirable(t3));
          for (let t3 of undesirables){
            Model.purge_t3(t3);
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

            let subreddit_bias = Model.subreddit_pool[t3.data.subreddit].bias;

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
              r_c.zadd(selektion_key, score, t3.data.id, ()=> {rs()});
            }));
          }
          Promise.all(promises).then( () => {
            //set our sorted set to expire after use.
            r_c.expire(selektion_key, 10);
            reso(selektion_key);
          }).catch( err => {console.log("blah!",err);rej(err + '.selektion-failure')});
        });
      });
    }).catch (err => {rej(err + '.scrape-fail')});
  });
};
// this returns duplicates.
Model.weighted_t3_selektion = function(n, dims){
  return new Promise( (reso,rej)=>{
    Model.refresh_selektion(dims).then( selektion_key => {
      let promises = [];
      for (let i=0;i<n;i++){
        promises.push( new Promise ((rs,rj) => {
          //this returns an array, even when it's of one.
          r_c.zrangebyscore(selektion_key, Math.random()*.9, 999, 'LIMIT', 0, 1, (err,t3) => {rs(t3[0])} );
        }));
      }
      Promise.all(promises).then( selektion => {
        reso(selektion);
      }).catch( err => {rej(err + '.pgpgpg')});;
    });
  });
};

Model.scrape_reddit_if_timely = function(){
  var d = new Date();
  var d_seconds = Math.round(d.getTime() / 1000);
  return new Promise( (reso,rej) => {
    r_c.get('last_scrape_t', (err,t) => {
      if(t===null) t=0;
      else t = parseInt(t);
      if (t + 1000 > d_seconds){
        reso( {scraped: "no"} );
        return;
      }
      r_c.set('last_scrape_t', d_seconds);
      let scrape_promise = Model.scrape_reddit();
      scrape_promise.then( result => {
        reso( {scraped: "yes", scrape : result} );
        return;
      }).catch( err => {rej(err + '.timely-scrape-failed')});;
    });
  });
};

Model.scrape_reddit = function(){
  console.log('SCRAPE engaged!');
  let url = Model.rand_subreddit_url();
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
        t3.orig_url = t3.data.url; // it may change from a page url.
        if (t3.data.url.match(/\.gif|gallery/))
          continue;

        //translate imgur to i.imgur
        //TODO: what if http://imgur.com/AsDfGhJk or whatever is an animated gif? I dont even know
        var match = t3.data.url.match(/http:\/\/imgur.com\/([a-zA-Z0-9]{5,})/);
        if (match){
          t3.data.url = "http://i.imgur.com/" + match[1] + ".jpg";
        }

        // run a bunch of filters: nsfw, jpg, score, size, etc.
        if(!t3_desirable(t3))
          continue;
        //re-insert. some data changes, such as reddit karma.
        let hundred_promises = [];
        hundred_promises.push(new Promise( (resx,rejx) => {
          r_c.hget('purged_t3', t3.data.id, (is_purged) => {
            if (!is_purged){
              r_c.hset('t3', t3.data.id, JSON.stringify(t3));
              r_c.sadd('t3_set', t3.data.id, () => { // for random selection
                resx();
              });
            }
            else { resx(); } // t3 already evaluated.
          });
        }));
        Promise.all(hundred_promises).then( values => {reso( {scraped : "yes"} ) } )
          .catch(err => {rej(err + '.one of a hundred promises failed?')});
      }
    }).catch( err => {rej(err + '.||||')});;
  });
};

Model.img_dir = "/tmp/t3_img";
Model.thumb_dir = "/tmp/t3_thumb";

if (!fs.existsSync(Model.thumb_dir)) 
  fs.mkdirSync(Model.img_dir, 0o744);
if (!fs.existsSync(Model.thumb_dir)) 
  fs.mkdirSync(Model.thumb_dir, 0o744);

var pic_requests = {};

//just resolves positive without downloading if it's at fspath already
Model.download_pic = function(pic_url, fspath){
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
            r_c.rpush('redirect_log', JSON.stringify({from:pic_url, to:resp.request.uri.href}));
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

Model.fspath_t3pic = function(t3id){
  var filename = t3id + '.jpg';
  var fspath = Model.img_dir + '/' + filename;
  return new Promise( (reso,rej) => {
    Model.t3_from_db(t3id).then( t3 => {
      var dl_promise = Model.download_pic(t3.data.url, fspath);
      dl_promise.then( () => {
        reso(fspath);
      }).catch( (err) => { rej(err + '.pic_dl_failed.'); });
    }).catch ( err => {rej(err + '.fspath_t3pic_failed')});
  });
};

Model.fspath_t3thumb = function(t3id){
  var filename = t3id + '.jpg';
  var fspath = Model.thumb_dir + '/' + filename;
  return new Promise( (reso,rej) => {
    Model.t3_from_db(t3id).then( t3 => {
      var dl_promise = Model.download_pic(t3.data.thumbnail, fspath);
      dl_promise.then( () => {
        reso(fspath);
      }).catch( (err) => { rej(err + '.thumb_dl_failed.'); });
    }).catch ( err => {rej(err + '.fspath_t3thumb_failed')});
  });
};


Model.t3_from_db = (t3id) => { //return a promise.
  var p = new Promise( (resolve,rej) => {
    r_c.hget('t3', t3id, (err, result) => {
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


Model.user_from_json = json_stuff => {
  var stuff = JSON.parse(json_stuff);
  var u = new Model.User();
  u.id = stuff.id
  return u;
}
Model.User = function(){
  // get a list of all the finished t3's
  this.get_fin = () => {
    return new Promise( (resolve, rej) => {
      r_c.hget('fin_by_user', this.id, (err,res) => {
        if (res === null)
          res = "{}";
        resolve(JSON.parse(res));
      });
    });
  }
  // fin_hash: {t3id : true,...} or {t3id:epochtime,...}
  this.set_fin = (fin_hash) => {
    return new Promise( (reso,rej) => {
      r_c.hset('fin_by_user', this.id, JSON.stringify(fin_hash));
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
      Model.weighted_t3_selektion(25, dims).then( t3ids => {
        this.get_fin().then ( (fin) => {
          for (let t3id of t3ids){
            if (!fin[t3id]){
              reso(t3id);
              return;
            }
          }
          rej('tried 10, nothing new found');
        });
      });
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
        Model.t3_from_db (t3id)
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


Model.get_user = (userid) => {
  return new Promise( (resolve,reject) => {
    r_c.hget('user',userid, function(err,user_json){
      resolve(Model.user_from_json(user_json));
    });
  });
};

Model.gen_new_user = function(){
  return new Promise( (resolve,reject) => {
    r_c.incr('next_userid', function(err,nextid){
      if(err)
        reject(err + '.asdf9');
      var user = new Model.User();
      user.id = nextid;
      r_c.hset('user', nextid, JSON.stringify(user));
      resolve(user);
    });
  });
}

// generate a new user if one doesn't exist
Model.get_user_from_session_id = function(sessid){
  return new Promise( (resolve, reject) => {
    r_c.hget('sess_userid', sessid, (err,userid) => {
      if(userid === null)
        Model.gen_new_user().then( (user) => {
          r_c.hset('sess_userid', sessid, user.id);
          resolve(user);
          return;
        });
      else Model.get_user(userid).then( (user) => {resolve(user)});
    });
  });
};

