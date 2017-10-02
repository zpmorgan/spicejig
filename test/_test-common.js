
module.exports = {
  get_config : get_config,
};

function get_config(){
  let config;
  try {
    config = require('./config.json')
    console.log('loading config.json');
  } catch (ex) {
    console.log('config not found. enabling dev mode.');
    config = {
      secret: 'lkasjdhfgkjlhafdgiludfha98fha98hf9agh',
      env: 'dev',
    }
  }
  return config;
}
