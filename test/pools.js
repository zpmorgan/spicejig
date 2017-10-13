import test from 'ava';
let Model = require('../model');
let Common = require('./_test-common.js');
let config = Common.get_config();

test.before( async () => {
  await Model.select_db(4);
});

test ('another_pool', async function(t){
  t.plan(2);

  Model.pools = {};
  Model.add_subreddit_pool('VillagePorn', {
    'VillagePorn': {bias:1},
  });
  Model.add_subreddit_pool('funny', {
    'funny': {bias:1},
  });
  let scrape_url = Model.pools.VillagePorn.rand_subreddit_url();
  t.regex(scrape_url, new RegExp('https://www.reddit.com/r/VillagePorn.*json.*'));
  await Model.pools.VillagePorn.scrape();
  let count = await Model.r_c.hlen(Model.pools.VillagePorn.t3_hash_key);
  t.true (count>10);
});

test.after( async t => {
  Model.r_c.flushdb();
});
