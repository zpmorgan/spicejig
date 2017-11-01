"use strict";
var request = require('request');
var redis = require("ioredis");
var fs = require('fs');
var path = require('path');
var config = require('./config.json');

let ImagePool = require('./model/pool.js');
let User = require('./model/user.js');

var Model = function(){
  this.r_c = redis.createClient();

  this.img_dir = "/tmp/t3_img";
  this.thumb_dir = "/tmp/t3_thumb";

  if (!fs.existsSync(this.thumb_dir))
    fs.mkdirSync(this.img_dir, 0o744);
  if (!fs.existsSync(this.thumb_dir))
    fs.mkdirSync(this.thumb_dir, 0o744);

  this.pools = {};
  this.add_subreddit_pool( 'faketrees', {
    ImaginarySwamps: {bias:30},
    ImaginaryForests: {bias:20},
    ImaginaryTrees: {bias:20},
    ImaginaryWildlands: {bias:8},
  });
  this.add_subreddit_pool( 'fakebuildings', {
    ImaginaryCityscapes: {bias:3},
    ImaginaryDwellings: {bias:10},
    ImaginaryVillages: {bias:13},
  });
  this.add_subreddit_pool( 'fakewater', {
    //ImaginaryLeviathans: {bias:1},
    ImaginaryRivers: {bias:3},
    ImaginaryLakes: {bias:3},
    ImaginaryWaterfalls: {bias:3},
    ImaginarySeascapes: {bias:2},
  });
  this.add_subreddit_pool( 'fakeportals', {
    ImaginaryPortals: {bias:3},
  });
};

Model.prototype.select_db = async function(dbid){
  return new Promise ((res,rej) => {
    this.r_c.select(dbid, ()=>{res()})
  })
}

Model.prototype.add_subreddit_pool = function(name, subreddits){
  let pool = new ImagePool(this, name, subreddits);
  this.pools[name] = pool;
}
  
//input the t3 hash or just the t3id
Model.prototype.purge_t3 = function(t3){
  let t3id = t3;
  if (typeof t3 == "object")
    t3id = t3.data.id;
  for (let pool in this.pools){
    this.r_c.hdel(pool.t3_hash_key,t3id);
    this.r_c.srem(pool.t3_set_key, t3id);
  }
  this.r_c.hset('purged_t3', t3id, 1);
  console.log('purged '+t3id);
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



Model.prototype.user_from_json = function(json_stuff){
  var stuff = JSON.parse(json_stuff);
  var u = new User(this);
  u.id = stuff.id
  return u;
}

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
      var user = new User();
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

Model.prototype.da_url_regex = new RegExp('https?://.+\.deviantart\.com/art')
Model.prototype.flickr_url_regex = new RegExp('https?://www\.flickr\.com/photos')
Model.prototype.imgur_page_url_regex = new RegExp('https?://imgur\.com/[a-zA-Z0-9]{2,}') //no albums

//cache resolutions in redis hash 'url_resolutions': url to resolved url

Model.prototype.resolve_pic_url = function(url){
  return new Promise ((resolve,reject) => {
    this.r_c.hget('url_resolutions', url, (resolvd_url) => {
      if (resolvd_url)
        resolve(resolvd_url);
      if (this.da_url_regex.test(url)){
        hostImageResolver(url).then( (da_resolved) => {
          console.log('resolved '+url+' to '+da_resolved[0]);
          this.r_c.hset('url_resolutions', url, da_resolved[0])
          resolve(da_resolved[0]);
        }).catch( err=> {
          reject(err + '.da_rejected')
        });
      }
      else if (this.flickr_url_regex.test(url)){
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
      else if (this.imgur_page_url_regex.test(url)){
        imgur_resolver.resolve(url, asdf => {
          console.log('resolved '+url+' to '+asdf.image);
          this.r_c.hset('url_resolutions', url, asdf.image)
          resolve(asdf.image);
        });
      }
      else {
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

