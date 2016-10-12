"use strict";

var Puzzle = function(gaem, screamer, pw,ph, img){
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
      return [new Phaser.Point(x1,y1), new Phaser.Point(x2,y2)];
      return [x1,y1,x2,y2];
    }
  };
  this.SinglePiece = function(px,py,borders){
    this.px = px;
    this.py = py;
    this.borders = borders;
    this.getBorders = function(){
      return this.borders;
    };
  }
  this.SinglePiece.prototype = new this.Piece();

  this.squiggle = function(){
    var A = new Phaser.Point(0,0);//start pt
    var AA = new Phaser.Point(0.2,0.1);//control pt
    var B = new Phaser.Point(1,0);
    var BB = new Phaser.Point(0.8,-.1);
    var midpoint = new Phaser.Point(0.5, 0);
    var nubpoint = new Phaser.Point(0.5, 0.2);
    var nub_A = new Phaser.Point(0.4, 0.2);
    var nub_B = new Phaser.Point(0.6, 0.2);
    var bpaths = [
      [A, AA, nub_A, nubpoint],
      [nubpoint, nub_B, BB, B]];
    //console.log(JSON.stringify(bpaths));
    return bpaths;
  }
  var _piece_border_id = 0;
  this.PieceBorder = function(corner1, corner2, straight_line){
    this.path = []; // a bunch of 4-point bezier control point arrays. (of Phaser.Point()s)
    this.id = ++_piece_border_id;
    this.corner2 = corner2;
    this.corner1 = corner1;

    this.getPaths = function(){ //not a copy so be careful
      if(this._paths)
        return this._paths;
      if (straight_line == true){
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
    }
  };

  //different pieces glommed together (or just one piece) make a globule
  // extends piece.
  this.Globule = function(piece){
    this.pieces = [piece]; // single pieces
    this.borders = [];
    this._neighbors = [];

    //if the same border is contained twice then it's not drawn.
    this.border_instances = {};
    this.incrementBorderInstances = function(borders){
      borders.forEach(function(bd){
        if (! bd.id in this.border_instances)
          this.border_instances[bd.id] = 0;
        this.border_instances[bd.id]++;
      }, this);
    };
    this.incrementBorderInstances(piece.getBorders());

    this.getBorders = function(){
      var ret = [];
      this.pieces.forEach(function(pc){
        pc.getBorders().forEach( function(bd){
          if (this.border_instances[bd.id] = 1)
            ret.push(bd);
        }, this);
      }, this);
      return ret;
    };

    this.glomGlobule = function(glob2){ // merge with another globule.
      this.incrementBorderInstances(glob2.getBorders()); // merge borders
      glob2.pieces.forEach(function(pc){ //push pieces
        this.pieces.push(pc);
      }, this);
      this._neighbors.push.apply(this._neighbors, glob2._neighbors);
      glob2.parent = this;
      var b1 = this.getBounds();
      var b2 = glob2.getBounds();
      var bu = Phaser.Rectangle.union(b1,b2);
      if(bu.x < b1.x)
        b1.cx -= b1.x - bu.x;
      if(bu.y < b1.y)
        b1.cy -= b1.y - bu.y;
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
        console.log(dist, d1, d2);
        if (dist < 5)
          this.glomGlobule(n);
          //n.glomGlobule(this);
      }, this);

    }
    this.findActualNeighbors = function(){
      var ret = [];
      this._neighbors.forEach(function(n){
        // n = puz.ultimateGlobule(n);
        while(n.parent) // if it's absorbed, find the superglobule
          n = n.parent;
        if (ret.includes(n))
          return;
        if (n == this)
          return;
        ret.push(n);
      }, this);
      this._neighbors = ret;
      return ret;
    }

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
      var borderDirection = [0,0,1,1];
      //give it a random position on the canvas.
      this.cx = puz.game.rnd.between(100, puz.game.width-100);
      this.cy = puz.game.rnd.between(100, puz.game.height-100);

      var bounds = this.getBounds();
      var piece_disp = bounds.topLeft;
      var rel = function(pt){
        return Phaser.Point.subtract(pt, piece_disp);
      };

      //var piece_canvas = new PIXI.CanvasBuffer(400,400);
      var piece_canvas = new PIXI.CanvasBuffer(bounds.width, bounds.height);
      var context = piece_canvas.context;

      var borders = piece.getBorders();
      context.beginPath();
      var movedTo = false;
      for (var i = 0; i < borders.length; i++){ //draw the curve on the canvas
        var bo = borders[i];
        var reversed = borderDirection[i];
        var paths = bo.getPaths().slice();
        if(reversed)
          paths.reverse();
        paths.forEach(function(bezier){
          var bz = bezier.slice() // copy to perhaps reverse and make relative to piece buffer
          for(var j=0;j<4;j++)
            bz[j] = Phaser.Point.subtract(bz[j], piece_disp);
          if (reversed)
            bz.reverse();
          if (movedTo == false){
            context.moveTo(bz[0].x, bz[0].y);
            movedTo = true;
          }
          context.bezierCurveTo(bz[1].x, bz[1].y, bz[2].x, bz[2].y, bz[3].x, bz[3].y);
        }, this);
      };

      //fill it in with the image
      var img=document.getElementById("scream");
      var pat = context.createPattern(img, "no-repeat");
      context.fillStyle = pat;
      context.save()
      context.translate(-piece_disp.x, -piece_disp.y);
      context.fill();
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
    }
  }

  this.Globule.prototype = new this.Piece();

  var piece_corners = [];
  for (var x=0; x<=this.pw; x++){
    piece_corners.push([]);
    for (var y=0; y<=this.ph; y++){
      var ix = this.apw * x;
      var iy = this.aph * y;
      piece_corners[x][y] = new Phaser.Point(ix,iy);
    }
  }
  //console.log(piece_corners);
  //console.log(this);

  //generate borders between pieces and at the sides of the image.
  // horz first
  var horz_piece_borders = [];
  for (var x = 0; x < this.pw; x++){
    horz_piece_borders.push([]);
    for (var y = 0; y <= this.ph; y++){
      var straight = false;
      if (y==0 || y==this.ph)
        straight = true;
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x+1][y], straight);
      horz_piece_borders[x][y] = pb;
    }
  }
  // now vertical piece borders.
  var vert_piece_borders = [];
  for (var x = 0; x <= this.pw; x++){
    vert_piece_borders.push([]);
    for (var y = 0; y < this.ph; y++){
      var straight = false;
      if (x==0 || x==this.pw)
        straight = true;
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x][y+1], straight);
      vert_piece_borders[x][y] = pb;
    }
  }

  this.glob_layout = [];

  //initialize puzzle by generating pieces.
  for (var x = 0; x < pw; x++){
    this.glob_layout[x] = [];
    for (var y = 0; y < ph; y++){
      var borders = [
        horz_piece_borders[x][y],
        vert_piece_borders[x+1][y],
        horz_piece_borders[x][y+1],
        vert_piece_borders[x][y]
      ];
      var s_piece = new this.SinglePiece(x,y,borders);

      var glob = new this.Globule(s_piece);
      this.glob_layout[x][y] = glob;
      var sprite = glob.genSprite(this);
    }
  }
  for (var x = 0; x < pw-1; x++){
    for (var y = 0; y < ph; y++){
      this.glob_layout[x][y]._neighbors.push( this.glob_layout[x+1][y] );
      this.glob_layout[x+1][y]._neighbors.push( this.glob_layout[x][y] );
    }
  }
  for (var x = 0; x < pw; x++){
    for (var y = 0; y < ph-1; y++){
      this.glob_layout[x][y]._neighbors.push( this.glob_layout[x][y+1] );
      this.glob_layout[x][y+1]._neighbors.push( this.glob_layout[x][y] );
    }
  }

};

