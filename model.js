var request = require('request');
var redis = require("redis");
var r_c = redis.createClient();

exports.rand_reddit_thing = () => { //return a promise
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


exports.t3_from_db = (thing_id) => { //return a promise.
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
exports.t3_img_path_when_ready = (t3_id) => {
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


