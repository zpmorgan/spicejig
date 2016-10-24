var request = require('request');
var redis = require("redis");
var r_c = redis.createClient();
var fs = require('fs');

var Model = {};
module.exports = Model;


Model.rand_reddit_thing = () => { //return a promise
  var url = "https://www.reddit.com/r/ImaginaryBestOf/top.json?limit=25&sort=top&t=all";
  var p = new Promise(function(resolve,reject){
    request(url, function(err,scrape_res, res_json){
      if(err) { res.json("blehblah "+ err.code); return;}
      if (scrape_res.statusCode !== 200) { res.json("code "+ scrape_res.statusCode); return;}
      var res_parsed = JSON.parse(res_json);
      if(res_parsed.kind !== "Listing") { res.json(res_parsed.kind); return;}
      var things = res_parsed.data.children;
      jpg_regex = /\.jpe?g(\?.*)?$/;
      nothings = things.filter(function(t){return ! t.data.url.match(jpg_regex)});
      things = things.filter(function(t){return t.data.url.match(jpg_regex)});
      var thing = things[Math.floor(Math.random()*things.length)];
      thing.img_from = "reddit";
      r_c.hset('t3', thing.data.id, JSON.stringify(thing));
      resolve(thing);
    });
  });
  return p;
}


Model.t3_from_db = (thing_id) => { //return a promise.
  var p = new Promise( (resolve,rej) => {
    r_c.hget('t3', thing_id, (err, result) => {
      if (!result){
        rej(thing_id + " not found as a t3 in redis");
      }
      else {
        var thing = JSON.parse(result);
        resolve(thing);
      }
    });
  });
  return p;
};
Model.t3_img_path_when_ready = (t3_id) => {
  var img_dir = "/tmp/";
  var filename = t3_id + '.jpg';
  var fspath = img_dir + filename;
  var p = new Promise( (resolve,rej) => {
    fs.access(fspath, fs.constants.R_OK, (err) => {
      if(!err){
        resolve(fspath);
        return;
      }
      Model.t3_from_db(t3_id).then( (thing) => {
        // get the json for the thing from redis
        // and download the actual jpg
        request
          .get(thing.data.url)
          .pipe(fs.createWriteStream(fspath))
          .on('finish', () => {
            resolve(fspath);
            //res.sendFile(fspath);
          })
          .on('error', function(err) {
               console.log(err)
          });
      });
    });
    //resolve('/foo');
  });
  return p;
};
Model.user_from_json = json_stuff => {
  stuff = JSON.parse(json_stuff);
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
        console.log(err,res,'asdf');
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
};
Model.User.prototype.fin = asdf=>{};

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
        reject(err);
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

