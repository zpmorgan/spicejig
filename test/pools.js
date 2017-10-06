import test from 'ava';
let Model = require('../model');
let Common = require('./_test-common.js');
let config = Common.get_config();

test.before( async () => {
  await Model.select_db(4);
});

test ('resolve_da', async function(t){
  t.plan(2);

  Model.pools = {};
  Model.add_subreddit_pool('funny', {
    'funny': {bias:1},
  });
  let scrape_url = Model.pools.funny.rand_subreddit_url();
  t.regex(scrape_url, new RegExp('https://www.reddit.com/r/funny.*json.*'));
  await Model.pools.funny.scrape();
  await function(){
    return new Promise( (r) => {
      t.log(Model.pools.funny.t3_hash_key);
      t.log(arguments[1]);
      Model.r_c.hlen(Model.pools.funny.t3_hash_key, (err,count)=>{
        t.true (count>10);
        r()
      });
    });
  }();
});

test.after( async t => {
  Model.r_c.flushdb();
});
