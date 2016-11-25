
// returns a gaussian random function with the given mean and stdev.
function gaussian(mean, stdev) {
    var y2;
    var use_last = false;
    return function() {
        var y1;
        if(use_last) {
           y1 = y2;
           use_last = false;
        }
        else {
            var x1, x2, w;
            do {
                 x1 = 2.0 * Math.random() - 1.0;
                 x2 = 2.0 * Math.random() - 1.0;
                 w  = x1 * x1 + x2 * x2;
            } while( w >= 1.0);
            w = Math.sqrt((-2.0 * Math.log(w))/w);
            y1 = x1 * w;
            y2 = x2 * w;
            use_last = true;
       }

       var retval = mean + stdev * y1;
       return retval;/*
       if(retval > 0)
           return retval;
       return -retval;*/
   }
}
// http://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
require(['phaser'], function(){
  var _gauss_1 = gaussian(0,1);
  Phaser.Point.Gaussian = function(stddev){
    return new Phaser.Point(_gauss_1()*stddev, _gauss_1()*stddev);
  };
  Phaser.Point.prototype.perturb = function(x,y){
    if (x === undefined)
      x=1;
    if (y===undefined)
      y=x;
    this.x += _gauss_1() * x;
    this.y += _gauss_1() * y;
    return this;
  };
  return Puzzle;
});
