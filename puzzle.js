
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
       if(retval > 0)
           return retval;
       return -retval;
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
});

var Puzzle = function(gaem, screamer, pw,ph, img){
  "use strict";
  this.game = gaem;
  this.screamer = screamer;
  this.ph = ph; // pieces wide/high, e.g. 15, 12
  this.pw = pw;
  this.iw = 300; //image size. as in, of all the pieces put together.
  this.ih = 300;
  //cw, ch: size of canvas in pixels.
  //as in, the working area on which it's assembled by the player...
  this.cw = 400;
  this.ch = 400;
  this.apw = this.iw / pw; // average piece width. not counting protrusions into neighboring pieces.
  this.aph = this.ih / ph;
  this.img = img;
  var puz = this;

  // nested class
  // px, py are col, row of the jigsaw cut.
  // cx,cy are positions on the canvas.
  this.Piece = function(){
    this.cx = 0;
    this.cy = 0;
    //this.borders = [];

    this.getBounds = function(){
      var borders = this.getBorders();
      var first_point = borders[0].getPaths()[0][0];// bz[0][0][0];
      var x1 = first_point.x;
      var x2 = first_point.x;
      var y1 = first_point.y;
      var y2 = first_point.y;
      borders.forEach(function(bd){
        bd.getPaths().forEach(function(bz){
          if(bz[0].x < x1) x1 = bz[0].x;
          if(bz[3].x < x1) x1 = bz[3].x;
          if(bz[0].x > x2) x2 = bz[0].x;
          if(bz[3].x > x2) x2 = bz[3].x;
          if(bz[0].y < y1) y1 = bz[0].y;
          if(bz[3].y < y1) y1 = bz[3].y;
          if(bz[0].y > y2) y2 = bz[0].y;
          if(bz[3].y > y2) y2 = bz[3].y;
        });
      });
      return new Phaser.Rectangle(x1,y1, x2-x1, y2-y1);
    };
  };
  this.SinglePiece = function(px,py,borders){
    this.px = px;
    this.py = py;
    this.borders = borders;
    this.getBorders = function(){
      return this.borders;
    };
  };
  this.SinglePiece.prototype = new this.Piece();

  this.squiggle = function(){
    var p = 0.091;
    var midpoint = new Phaser.Point(0.5, 0).perturb(p,0);
    var nubpoint = new Phaser.Point(midpoint.x, 0.2).perturb(0, p);
    var nubpoint_slope = new Phaser.Point(0.19,0).perturb(p);
    var stalk_offset = new Phaser.Point(-0.05, nubpoint.y * 0.15 );
    var stalk_a = Phaser.Point.add(midpoint, stalk_offset);
    stalk_offset.multiply(-1,1); //other side
    var stalk_b = Phaser.Point.add(midpoint, stalk_offset);
    //var stalk_a = new Phaser.Point(nubpoint.x-0.05, nubpoint.y/2.5);
    var stalk_a_slope = new Phaser.Point(-0.00, nubpoint.y/3);
    var stalk_b_slope = stalk_a_slope.clone().multiply(1,-1);
    var bpaths = [
      [new Phaser.Point(0,0), new Phaser.Point(0.2,0).perturb(p),
        Phaser.Point.subtract(stalk_a, stalk_a_slope), stalk_a],
      [stalk_a, Phaser.Point.add(stalk_a, stalk_a_slope),
        Phaser.Point.subtract(nubpoint, nubpoint_slope), nubpoint],
      [nubpoint, Phaser.Point.add(nubpoint, nubpoint_slope),
        Phaser.Point.subtract(stalk_b, stalk_b_slope), stalk_b],
      [stalk_b, Phaser.Point.add(stalk_b, stalk_b_slope),
        new Phaser.Point(0.8,0).perturb(p), new Phaser.Point(1,0)],
      //[nubpoint, nubpoint, nubpoint, new Phaser.Point(1,0)],
    ];
      /*[A, AA, nub_stalk_A_approach, nub_stalk_A],
      [nub_stalk_A, nub_stalk_A_climb, nub_A, nubpoint],
      [nubpoint, nub_B, BB, B]];*/
    //console.log(JSON.stringify(bpaths));
    return bpaths;
  };
  var _piece_border_id = 0;
  this.PieceBorder = function(corner1, corner2, straight_line){
    this.id = ++_piece_border_id;
    this.corner2 = corner2;
    this.corner1 = corner1;

    this.getPaths = function(){ //not a copy so be careful
      if(this._paths)
        return this._paths;
      if (straight_line === true){
        this._paths = [[corner1, corner1, corner2, corner2]];
        return this._paths;
      }
      //this._paths = this.squiggle(); // [[bz],[bz],...]
      var squig = puz.squiggle(); // [[bz],[bz],...]
      var first_squig_point = squig[0][0];
      var last_squig_point = squig[squig.length-1][3];
      var squig_vector = Phaser.Point.subtract(last_squig_point, first_squig_point);
      var border_vector = Phaser.Point.subtract(corner2, corner1);
      var angle = Phaser.Point.angle(border_vector, squig_vector); //in radians
      //angle prolly pi/2 or 0;
      var scale = border_vector.getMagnitude() / squig_vector.getMagnitude();
      for(var i=0; i < squig.length; i++){
        for (var j=0; j < 4; j++){
          var p = Phaser.Point.subtract(squig[i][j], first_squig_point);//probably 0,0 anyways
          p.rotate(0,0,angle, false);
          p.multiply(scale, scale);
          squig[i][j] = Phaser.Point.add(p, corner1);
        }
      }
      this._paths = squig;
      return this._paths;
    };
  };

  //different pieces glommed together (or just one piece) make a globule
  // extends piece.
  this.Globule = function(original_piece){
    this.pieces = [original_piece]; // single pieces
    this.borders = [];
    this._neighbors = [];

    //if the same border is contained twice then it's not drawn.
    this._border_instances = {};
    this.incrementBorderInstances = function(borders){
      borders.forEach(function(bd){
        //if (! bd.id in this._border_instances)
        if (! this._border_instances.hasOwnProperty(bd.id))
          this._border_instances[bd.id] = 0;
        this._border_instances[bd.id] += 1;
      }, this);
    };
    this.incrementBorderInstances(original_piece.getBorders());

    this.getBorders = function(){
      var ret = [];
      this.pieces.forEach(function(pc){
        pc.getBorders().forEach( function(bd){
          if (this._border_instances[bd.id] === 1)
            ret.push(bd);
        }, this);
      }, this);
      return ret;
    };

    this.glomGlobule = function(glob2){ // merge with another globule.
      var b1 = this.getBounds();
      var b2 = glob2.getBounds();
      var bu = Phaser.Rectangle.union(b1,b2);
      this.incrementBorderInstances(glob2.getBorders()); // merge borders
      glob2.pieces.forEach(function(pc){ //push pieces
        this.pieces.push(pc);
      }, this);
      this._neighbors.push.apply(this._neighbors, glob2._neighbors);
      glob2.parent = this;
      if(bu.x < b1.x)
        this.cx -= (b1.x - bu.x);
      if(bu.y < b1.y)
        //this.cy = bu.y;
        this.cy -= b1.y - bu.y;
      this._sprite.destroy();
      glob2._sprite.destroy();
      this.genSprite();

    };

    this.checkForGlomming = function(){
      var neighbors = this.findActualNeighbors();
      var d1 = this.getDisp();
      neighbors.forEach(function(n){
        var d2 = n.getDisp();
        var dist = Phaser.Point.distance(d1,d2);
        if (dist < 5)
          this.glomGlobule(n);
          //n.glomGlobule(this);
      }, this);

    };
    this.findActualNeighbors = function(){
      var ret = [];
      this._neighbors.forEach(function(n){
        // n = puz.ultimateGlobule(n);
        while(n.parent) // if it's absorbed, find the superglobule
          n = n.parent;
        if (ret.includes(n))
          return;
        if (n === this)
          return;
        ret.push(n);
      }, this);
      this._neighbors = ret;
      return ret;
    };

    this.getDisp = function(){
      var bounds = this.getBounds();
      var should_be = bounds.topLeft;
      var is = new Phaser.Point(this.cx, this.cy);
      return Phaser.Point.subtract(is, should_be);
      //bounds.topleft is where it "should be"
      //glob.{cx,cy} is where it is.
      //where it is minus where it should be is the displacement.
    };

    this.genSprite = function(){
      //var borderDirection = [0,0,1,1];
      var borders = this.getBorders();

      // need to find a route around the glob.
      var bd_from_pt = {}; // look up borders from points
      for (var bd in borders){ // vivify & clear flags
        bd_from_pt[borders[bd].corner1.id] = [];
        bd_from_pt[borders[bd].corner2.id] = [];
        borders[bd].flag_reverse = false;
        borders[bd].flag_begin_path = false;
      }
      for (bd in borders){
        bd_from_pt[borders[bd].corner1.id].push(borders[bd]);
        bd_from_pt[borders[bd].corner2.id].push(borders[bd]);
      }
      var route = [];
      while(route.length < borders.length){
        // get first border not in route.
        var starting_border;
        for (var i in borders){
          var bd = borders[i];
          if (! route.includes(bd)){
            starting_border = bd;
            break;
          }
        }
        starting_border.flag_begin_path = true;
        route.push(starting_border);
        while(1){
          var prev_bd = route[route.length-1];
          var next_pt = prev_bd.corner2;
          if (prev_bd.flag_reverse)
            next_pt = prev_bd.corner1;
          var next_bd = undefined; // jeez, no block scope in this language.
          var next_bd_candidates = bd_from_pt[next_pt.id];
          for (i in next_bd_candidates){
            if (route.includes(next_bd_candidates[i]))
              continue;
            next_bd = next_bd_candidates[i];
            if (next_bd.corner2 === next_pt)
              next_bd.flag_reverse = true;
            break;
          }
          if (! next_bd){
            //console.log("loopyness");
            break;
            //completed a loop. there may be an internal loop or something.
            //if so the process will repeat with a start flag.
          }
          route.push(next_bd);
          //console.log(route);
        }
      }

      var bounds = this.getBounds();
      var piece_disp = bounds.topLeft;

      //var piece_canvas = new PIXI.CanvasBuffer(400,400);
      var piece_canvas = new PIXI.CanvasBuffer(bounds.width, bounds.height);
      var context = piece_canvas.context;

      context.beginPath();
      for (var i in route){ //draw the curve on the canvas
        var bd = route [i];
        var reversed = bd.flag_reverse;
        var paths = bd.getPaths().slice();
        if(reversed)
          paths.reverse();
        for (var foo = 0; foo < paths.length; foo++){
          var bezier = paths[foo];
          var bz = bezier.slice(); // copy to perhaps reverse and make relative to piece buffer
          for(var j=0;j<4;j++)
            bz[j] = Phaser.Point.subtract(bz[j], piece_disp);
          if (reversed)
            bz.reverse();
          if (bd.flag_begin_path){
            context.moveTo(bz[0].x, bz[0].y);
          }
          context.bezierCurveTo(bz[1].x, bz[1].y, bz[2].x, bz[2].y, bz[3].x, bz[3].y);
        };
      };

      //fill it in with the image
      var img=document.getElementById("scream");
      var pat = context.createPattern(img, "no-repeat");
      context.fillStyle = pat;
      context.save();
      context.translate(-piece_disp.x, -piece_disp.y);
      context.fill("evenodd");
      context.restore();
      var tex = PIXI.Texture.fromCanvas(piece_canvas.canvas);

      //piece.sprite = this.game.add.sprite(piece.cx,piece.cy, screamer);
      var sprite = puz.game.add.sprite(this.cx,this.cy, tex);
      sprite.inputEnabled = true;
      sprite.input.enableDrag();
      //sprite.input.boundsRect = puzzle.game.camera;
      sprite.input.pixelPerfectAlpha = 128;
      sprite.input.pixelPerfectClick = true;
      sprite.input.bringToTop = true;
      var globbo = this;
      sprite.events.onDragStop.add(function(item, pointer){
        //console.log(puzzle, pointer, item);
        //console.log(globbo);
        //console.log(globbo.cx);
        //console.log(item.x);
        globbo.cx = item.x;
        globbo.cy = item.y;
        globbo.checkForGlomming();
        //puz.checkForGlomming(globbo);

      });
      this._sprite = sprite;

      return sprite;
    };
  };

  this.Globule.prototype = new this.Piece();

  var corner_ids = 0;
  var piece_corners = [];
  var x,y;
  for (x=0; x<=this.pw; x++){
    piece_corners.push([]);
    for (y=0; y<=this.ph; y++){
      var ix = this.apw * x;
      var iy = this.aph * y;
      piece_corners[x][y] = new Phaser.Point(ix,iy);
      piece_corners[x][y].id = corner_ids++;
    }
  }
  //console.log(piece_corners);
  //console.log(this);

  //generate borders between pieces and at the sides of the image.
  // horz first
  var horz_piece_borders = [];
  for (x = 0; x < this.pw; x++){
    horz_piece_borders.push([]);
    for (y = 0; y <= this.ph; y++){
      var straight = false;
      if (y===0 || y===this.ph)
        straight = true;
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x+1][y], straight);
      horz_piece_borders[x][y] = pb;
    }
  }
  // now vertical piece borders.
  var vert_piece_borders = [];
  for (x = 0; x <= this.pw; x++){
    vert_piece_borders.push([]);
    for (y = 0; y < this.ph; y++){
      var straight = false;
      if (x===0 || x===this.pw)
        straight = true;
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x][y+1], straight);
      vert_piece_borders[x][y] = pb;
    }
  }

  this.glob_layout = [];

  //initialize puzzle by generating pieces.
  for (x = 0; x < pw; x++){
    this.glob_layout[x] = [];
    for (y = 0; y < ph; y++){
      var borders = [
        horz_piece_borders[x][y],
        vert_piece_borders[x+1][y],
        horz_piece_borders[x][y+1],
        vert_piece_borders[x][y]
      ];
      var s_piece = new this.SinglePiece(x,y,borders);

      var glob = new this.Globule(s_piece);
      this.glob_layout[x][y] = glob;
      //give it a random position on the canvas.
      glob.cx = puz.game.rnd.between(100, puz.game.width-100);
      glob.cy = puz.game.rnd.between(100, puz.game.height-100);
      //var sprite = glob.genSprite(this);
      glob.genSprite(this);
    }
  }
  for (x = 0; x < pw-1; x++){
    for (y = 0; y < ph; y++){
      this.glob_layout[x][y]._neighbors.push( this.glob_layout[x+1][y] );
      this.glob_layout[x+1][y]._neighbors.push( this.glob_layout[x][y] );
    }
  }
  for (x = 0; x < pw; x++){
    for (y = 0; y < ph-1; y++){
      this.glob_layout[x][y]._neighbors.push( this.glob_layout[x][y+1] );
      this.glob_layout[x][y+1]._neighbors.push( this.glob_layout[x][y] );
    }
  }

};

