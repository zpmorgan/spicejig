import test from 'ava';
let Model = require('../model');
let Common = require('./_test-common.js');
let config = Common.get_config();

test.before( async () => {
  await Model.select_db(4);
});

test ('another_pool', async function(t){
  t.plan(5);

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
  await Model.pools.funny.scrape();
  let count = await Model.r_c.hlen(Model.pools.VillagePorn.t3_hash_key);
  t.true (count>10);

  let t3s = await Model.pools.funny.weighted_t3_selektion(3, [1,1]);
  t.log(t3s);
  for (let t3id of t3s){
    let t3 = await Model.pools.funny.t3_from_db(t3id);
    t.is(t3.data.subreddit, 'funny');
  };
});

test.after( async t => {
  Model.r_c.flushdb();
});
