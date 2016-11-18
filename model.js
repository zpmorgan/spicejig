"use strict";
var request = require('request');
var rp = require('request-promise');
var redis = require("redis");
var r_c = redis.createClient();
var fs = require('fs');

var Model = {};
module.exports = Model;

Model.rand_subreddit_url = function(){
  var subreddits = ['imaginarybestof', 'NoSillySuffix', 'ImaginaryMindscapes', 'wallpapers'];
  var s = subreddits[Math.floor(Math.random()*subreddits.length)];
  //"https://www.reddit.com/r/ImaginaryMindscapes/top.json?limit=25&sort=top&t=all",
  var url;
  if (Math.random() > .5)
    url = "https://www.reddit.com/r/"+s+"/top.json?limit=100&sort=top&t=all";
  else
    url = "https://www.reddit.com/r/"+s+"/.json?limit=100";
  return url;
};

Model.refresh_selektion = function(){
  return new Promise( (reso,rej) => {
    Model.scrape_reddit_if_timely().then( () => {
      r_c.srandmember('t3_set', 40, (err,t3ids) => {
        if(err) {rej(err+".vbvbvb");return};
        r_c.hmget('t3', t3ids, (err,t3s) => {
          if(err) {rej(err+".8d8d8d");return};
          for (let i=0; i < t3s.length; i++)
            t3s[i] = JSON.parse(t3s[i]);
          //filter out nsfw
          t3s = t3s.filter( t3 => {
            if(t3.data.thumbnail === 'nsfw')
              return false;
            return true;
          });
          let totscore = 0;
          for(let t3 of t3s){
            totscore += t3.data.score;
          }
          r_c.del('t3_selektor', () => {
            let promises = [];
            let score = 0;
            for(let t3 of t3s){
              promises.push(new Promise( (rs,rj) => {
                score += t3.data.score / totscore;
                r_c.zadd('t3_selektor', score, t3.data.id, ()=> {rs()});
              }));
            }
            Promise.all(promises).then( () => {
              reso(true);
            }).catch( err => {console.log("blah!",err);rej(err + ', qzqzqz')});
          });
        });
      });
    }).catch (err => {rej(err + 'bhobho')});
  });
};
// this returns duplicates.
Model.weighted_t3_selektion = function(n){
  return new Promise( (reso,rej)=>{
    let promises = [];
    for (let i=0;i<n;i++){
      promises.push( new Promise ((rs,rj) => {
        //this returns an array, even when it's of one.
        r_c.zrangebyscore('t3_selektor', Math.random()*.9, 999, 'LIMIT', 0, 1, (err,t3) => {rs(t3[0])} );
      }));
    }
    Promise.all(promises).then( selektion => {
      reso(selektion);
    }).catch( err => {rej(err + '.pgpgpg')});;
  });
};

Model.scrape_reddit_if_timely = function(){
  var d = new Date();
  var d_seconds = Math.round(d.getTime() / 1000);
  return new Promise( (reso,rej) => {
    r_c.get('last_scrape_t', (err,t) => {
      if(t===null) t=0;
      else t = parseInt(t);
      if (t + 100 > d_seconds){
        reso( {scraped: "no"} );
        return;
      }
      r_c.set('last_scrape_t', d_seconds);
      let scrape_promise = Model.scrape_reddit();
      scrape_promise.then( result => {
        reso( {scraped: "yes", scrape : result} );
        return;
      });
      scrape_promise.catch( err => {rej(err + '.qpqpqp')});;
    });
  });
};

Model.scrape_reddit = function(){
  let url = Model.rand_subreddit_url();
  return new Promise ( (reso,rej) => {
    rp(url).then( json => {
      var subreddit_page = JSON.parse(json);

      var t3s = subreddit_page.data.children;
      if (t3s.length < 3){
        rej('whaaaat? url ' + url + ' returned:'+ "\n\n\n\n\n"+ json); return;
      }
      var hundred_promises = [];
      for (let t3 of t3s){
        var jpg_re = /\.jpg/;
        if (! t3.data.url.match(jpg_re)) //only direct links to images please
          continue;
        r_c.hset('t3', t3.data.id, JSON.stringify(t3));
        //remove from score index and re-insert.
        // on redis 3 it can be done in one operation.
        hundred_promises.push(new Promise( (resx,rejx) => {
          r_c.sadd('t3_set', t3.data.id); // for random selection
          r_c.zrem('t3_reddit_score', t3.data.id, () => {
            r_c.zadd('t3_reddit_score', t3.data.score, t3.data.id, ()=>{
              resx();
              //console.log(t3.data.score, t3.data.id);
            });
          });
        }));
      }
      //console.log(hundred_promises.length, 345345);
      Promise.all(hundred_promises).then( values => {reso( {scraped : "yes"} ) } )
        .catch(err => {rej(err + 'l4l4l4')});
    }).catch( err => {rej(err + '.||||')});;
  });
};

var t3pic_requests = {};
// resolve file path when image starts downloading
// resolve file path if it's already downloading
// resolve file path if it's already downloaded
// reject if 404.
Model.fspath_t3pic = function(t3id){
  var img_dir = "/tmp/";
  var filename = t3id + '.jpg';
  var fspath = img_dir + filename;
  return new Promise( (reso,rej) => {
    if (t3pic_requests[t3id]){
      reso(fspath);//partially downloaded? maybe that's ok.
      return;
    }
    var stat = fs.stat(fspath, (err,stats) => {
      if (!err){
        reso(fspath);
        return;
      }
      // file not found, so fetch it.
      Model.t3_from_db(t3id).then( t3 => { // it's not here, gotta fetch it.
        console.log('getting '+t3.data.url);
        var r = request.get(t3.data.url);
        var w = fs.createWriteStream(fspath);
        w.on('open', () => {
          //console.log('w opend > ' + fspath);
        });
        w.on('finish', () => {
          reso(fspath);
          delete t3pic_requests[t3.data.id];
        });
        t3pic_requests[t3.data.id] = r;
        r.pipe(w);
      }).catch ( err => {rej(err + '.orooroorooro')});
    });
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
      console.log(this.id);
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
  //
  this.next_t3 = () => {
    return new Promise((reso, rej) => {
      reso(1234);
    });
  };
  this.rand_unfinished_t3id = function(){
    return new Promise( (reso,rej)=>{
      Model.refresh_selektion().then(() => {
        Model.weighted_t3_selektion(10).then( t3ids => {
          this.get_fin().then ( (fin) => {
            for (let t3id of t3ids){
              if (!fin[t3id]){
                reso(t3id);
                return;
              }
            }
            rej('tried 10, nothing new found');
          });
        });;
      });
    });
  }
  this.rand_unfinished_t3 = function(){
    return new Promise( (reso,rej)=>{
      this.rand_unfinished_t3id().then( t3id => {
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

if(false)
['log', 'warn'].forEach(function(method) {
  var old = console[method];
  console[method] = function() {
    var stack = (new Error()).stack.split(/\n/);
    // Chrome includes a single "Error" line, FF doesn't.
    if (stack[0].indexOf('Error') === 0) {
      stack = stack.slice(1);
    }
    var args = [].slice.apply(arguments).concat([stack[1].trim()]);
    return old.apply(console, args);
  };
});

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
      var user = {id : nextid};
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

