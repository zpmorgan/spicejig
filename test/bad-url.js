import test from 'ava';

let Model = require('../model');

// 4paf0d
let bad_url = 'http://67.media.tumblr.com/3e060aa8fa02e251bb6e3f5e2e4288c8/tumblr_ndsuyqzqga1ri1r1uo1_1280.jpg';
let bad_path = '/tmp/asdffdsfa.jpg';

test ('foo', async function(t){
  t.plan(2);
  await Model.select_db(2);
  let dl_promise = Model.download_pic (bad_url, bad_path);
  t.log(234234);
  t.log("asdfasdf\n");
  t.truthy(dl_promise);
  t.log(dl_promise);
  await t.throws(dl_promise);
});
