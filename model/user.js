
let User = function(m){
  // get a list of all the finished t3's
  this.model = m;
  this.get_fin = () => {
    return new Promise( (resolve, rej) => {
      this.model.r_c.hget('fin_by_user', this.id, (err,res) => {
        if (res === null)
          res = "{}";
        resolve(JSON.parse(res));
      });
    });
  }
}
// fin_hash: {t3id : true,...} or {t3id:epochtime,...}
User.prototype.set_fin = (fin_hash) => {
  return new Promise( (reso,rej) => {
    this.model.r_c.hset('fin_by_user', this.id, JSON.stringify(fin_hash));
    reso();
  });
};

//mark a t3 as finished by this user.
//returns the same thing as user.get_fin
User.prototype.fin_t3 = (t3id, val) => {
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

//return a random t3 that hasn't been fin'd by this user
User.prototype.rand_unfinished_t3id = function(dims){
  return new Promise( (reso,rej)=>{
    this.model.pools.default.weighted_t3_selektion(25, dims).then( t3ids => {
      this.get_fin().then ( (fin) => {
        for (let t3id of t3ids){
          if (!fin[t3id]){
            reso(t3id);
            return;
          }
        }
        rej('tried 10, nothing new found');
      });
    }).catch(err => {rej(err + '.rand_t3id_fail')});
  });
}
User.prototype.rand_unfinished_t3 = function(dims){
  return new Promise( (reso,rej)=>{
    this.rand_unfinished_t3id(dims).then( t3id => {
      if (!t3id){
        console.log('no t3 found for dims:' + dims);
        rej('no t3 found for dims:' + dims);
        return;
      }
      this.model.pools.default.t3_from_db (t3id)
        .then( t3 => { //return a promise.
          reso(t3);
        })
        .catch( err => {
          rej('t3 getting err: '+ err + '.bifffff');
        });
    }).catch( err => {rej('couldnt get a rand id'+ err + '.mikmik')});;
  });
};

module.exports = User;

