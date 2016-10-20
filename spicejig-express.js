//var http = require("http");
//var cheerio = require('cheerio');
var fs = require('fs');
var request = require('request');
var express = require('express');
var app = express();
app.use(express.static(__dirname + '/static'));
var redis = require("redis");
var r_c = redis.createClient();

app.get('/',function(req, res) {
  console.log(__dirname);
  res.sendFile(__dirname + '/static/puzzle.html');
});

var Model = {};

Model.rand_reddit_thing = () => { //return a promise
  var url = "https://www.reddit.com/r/ImaginaryBestOf/.json";
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
      r_c.hset('t3', thing.data.id, JSON.stringify(thing));
      resolve(thing);
    });
  });
  return p;
}
app.get('/scrapejson', function(req,res){
  model.rand_reddit_thing().then(function(thing){
    res.json(thing);
  });
});

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

app.get('/t3/:t3id', (req,res) => {
  var img_dir = "/tmp/";
  var filename = req.params.t3id + '.jpg';
  //var fspath = img_dir + filename;
  Model.t3_img_path_when_ready(req.params.t3id)
    .then( (filepath) => {
      res.sendFile(filepath);
    })
    .catch( (err) => {
      console.log(err);
      res.json(err);
    });
  return;

  fs.access(fspath, fs.constants.R_OK, (err) => {
    if(!err){
      res.sendFile(fspath);
      return;
    }
    Model.t3_from_db(req.params.t3id).then( (thing)=>{
      //download from imgur, deviantart, etc, then tell express to send the file
      request
        .get(thing.data.url)
        .pipe(fs.createWriteStream(fspath))
        .on('finish', () => {
          res.sendFile(fspath);
        });
    });
  });
  //res.sendFile('/home/zach/codestuff/scratch/spicejig/' + 'static/images/scream.jpg');
});

app.get('/scrape', function(req,res){
  var url = "https://www.reddit.com/r/ImaginaryBestOf";
  request(url, function(err,scrape_res,html){
    if(err) return;
    var $ = cheerio.load(html);
    var entries = $('.thing');
    var entry = entries.get(Math.floor(Math.random()*entries.length));
    console.log(Object.getOwnPropertyNames(entries));
    console.log(entry);
    console.log(entry.attr());
    return;
    var entries = $('.thing').toArray();
    console.log(entries[0]);
    res.json(entries[0].attr('data-url'));
    var entry = entries[Math.floor(Math.random()*entries.length)];
    return;
    console.log(entries);
    console.log(entries.toArray().length);
                return;
    //console.log(entries);
    var entry = entries[Math.floor(Math.random()*entries.length)];
    console.log(entries);
    console.log(entry.data('url'));
    console.log(entries[0].data('url'));
    res.json(entries[0].attr('data-url'));
  });
});
app.get('/new_puz_spec', function(req,res){
  var p = new Promise( (resolve,reject) => {
    Model.rand_reddit_thing().then( (tng) => {
      r_c.hget ('t3',tng.data.id, (err, cached_tng) => {
        //console.log(err, cached_tng);
        if (cached_tng){
          resolve(JSON.parse(cached_tng));
        } else {
          //console.log(JSON.stringify(tng));
          resolve(tng);
        }
      });
    });
  });
  p.then( (tng) => {res.json(tng)}).catch((err) => {console.log(err)});;
});

app.listen(8888);

