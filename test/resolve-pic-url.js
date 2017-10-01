import test from 'ava';
let Model = require('../model');

let fake_t3 = {
  data:{
    score:666,
    preview:'asdf',
    subreddit:'asdf',
    title:'asdf',
    preview: {
      images: [
        {source: {width:666, height:666}}
      ]
    },
  }
};

// 4paf0d
let da_url = 'https://compoundinterest.deviantart.com/art/cosmo-2-2-705741522'
da_url = 'https://raedrob.deviantart.com/art/Desert-Guardian-704243861'

let da_t3 = JSON.parse(JSON.stringify(fake_t3));
da_t3.data.url = da_url;
let flick_t3 = JSON.parse(JSON.stringify(fake_t3));

test ('resolve_da', async function(t){
  t.plan(1);
  
  let da_jpg = await Model.resolve_pic_url(da_url);
  // if this tends to change we need a regex.
  t.is(da_jpg, 'https://pre00.deviantart.net/a20b/th/pre/f/2017/256/d/7/desert_guardian_by_raedrob-dbnae1h.jpg');

});

let bad_da_url = 'https://asdffdsafdfh4f.deviantart.com/art/asdhaug-2824523892734';
test ('bad_da_url', async function(t){
  t.plan(1)
  await t.throws(Model.resolve_pic_url(bad_da_url))
});


let flickr_url = 'https://www.flickr.com/photos/peterstahl/37394766835/in/dateposted/'
test('resolve_flickr', async function(t){
  t.plan(1);
  let flickr_jpg = await Model.resolve_pic_url(flickr_url);
  t.is(flickr_jpg, 'https://farm5.staticflickr.com/4500/37394766835_628b76c8a3_b.jpg');
});

let bad_flickr_url = 'https://www.flickr.com/photos/asdhaug/2824523892734';
test ('flick_bad_url', async function(t){
  t.plan(1)
  await t.throws(Model.resolve_pic_url(bad_da_url))
});


