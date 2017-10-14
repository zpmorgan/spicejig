
// per-pool redis keys:
// pool_{{name}}_set
// pool_{{name}}_hash
// pool_{{name}}_t3_selektor_{{num}} (these expire after a few secs)

ImagePool = function(m, name, subreddits){
  this.model = m;
  this.subreddits = subreddits;
  this.name = name;
  this.t3_set_key = "pool_"+ this.name+"_set";
  this.t3_hash_key = "pool_"+ this.name+"_hash";

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
};

let selektion_increment = 0;

ImagePool.prototype.refresh_selektion = function(dims, excludes){
  // temporary keys like pool_birdpics_t3_selektor_2342
  let selektion_key = 'pool_' + this.name  +"_t3_selektor_"+ selektion_increment;
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
ImagePool.prototype.weighted_t3_selektion = function(n, dims){
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
ImagePool.prototype.scrape = function(){
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
ImagePool.prototype.scrape_if_timely = function(){
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
ImagePool.prototype.fspath_t3pic = function(t3id){
  var filename = t3id + '.jpg';
  var fspath = this.model.img_dir + '/' + filename;
  return new Promise( (reso,rej) => {
    this.t3_from_db(t3id).then( t3 => {
      var dl_promise = this.model.download_pic(t3.data.url, fspath);
      dl_promise.then( () => {
        reso(fspath);
      }).catch( (err) => { rej(err + '.pic_dl_failed.'); });
    }).catch ( err => {rej(err + '.fspath_t3pic_failed')});
  });
};

ImagePool.prototype.fspath_t3thumb = function(t3id){
  var filename = t3id + '.jpg';
  var fspath = this.model.thumb_dir + '/' + filename;
  return new Promise( (reso,rej) => {
    this.t3_from_db(t3id).then( t3 => {
      var dl_promise = this.model.download_pic(t3.data.thumbnail, fspath);
      dl_promise.then( () => {
        reso(fspath);
      }).catch( (err) => { rej(err + '.thumb_dl_failed.'); });
    }).catch ( err => {rej(err + '.fspath_t3thumb_failed')});
  });
};


ImagePool.prototype.t3_from_db = function(t3id){ //return a promise.
  var p = new Promise( (resolve,rej) => {
    this.model.r_c.hget(this.t3_hash_key, t3id, (err, result) => {
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
  //find the number of pixels; filter out the hubble deep field, and other absurdly big things
  //increase by 5% per year until phones catch up to hubble
  if(t3.data.preview.images[0].source.width * t3.data.preview.images[0].source.height > 9000000)
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


module.exports = ImagePool;


