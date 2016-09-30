
var Puzzle = function(game, screamer, pw,ph, img){
  this.game = game;
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
  this.pieces = [];

  // nested class
  // px, py are col, row of the jigsaw cut.
  // cx,cy are positions on the canvas.
  this.Piece = function(px,py, borders){
    this.px = px;
    this.py = py;
    this.cx = 0;
    this.cy = 0;
    this.borders = borders;

    this.paths = function(){
      var ret = [];
      ret.push([50,0, 100,0, 100,100, 50,100]);
      ret.push([50,100, 0,100, 0,0, 50,0]);
      return ret;
    };
  };
  this.PieceBorder = function(corner1, corner2){
//    this.p1 = p1;
//    this.p2 = p2;
    //this.o = orientation; //'h' or 'v'
    this.path = []; // a bunch of 8-value bezier control point arrays.
    this.corner2 = corner2;
    this.corner1 = corner1;
    //console.log(corner1, corner1.y);

    this.getPaths = function(){
      if(this._paths)
        return this._paths;
      var midpoint = Phaser.Point.multiplyAdd(corner1, corner2, .5);
      var nubsize = .3;
      var pvec = Phaser.Point.subtract(corner1, corner2).multiply(.3,.3).perp();
      if(Phaser.Utils.chanceRoll()){
        pvec = pvec.multiply(-1,-1);
      }
      var nubpoint = Phaser.Point.add(midpoint, pvec);
      this._paths = [[corner1, nubpoint, midpoint, corner2]];
      return this._paths;
    }
  };

  //todo: use this.
  this.setPiece = function(x,y, piece){
    this.pieces[y*ph + x] = piece;
  }

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
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x+1][y]);
      horz_piece_borders[x][y] = pb;
    }
  }
  // now vertical piece borders.
  var vert_piece_borders = [];
  for (var x = 0; x <= this.pw; x++){
    vert_piece_borders.push([]);
    for (var y = 0; y < this.ph; y++){
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x][y+1]);
      vert_piece_borders[x][y] = pb;
    }
  }

  //initialize puzzle by generating pieces.
  for (var x = 0; x < pw; x++){
    for (var y = 0; y < ph; y++){
      var borders = [
        horz_piece_borders[x][y],
        vert_piece_borders[x+1][y],
        horz_piece_borders[x][y+1],
        vert_piece_borders[x][y]
      ];
      var piece = new this.Piece(x,y,borders);
      piece.borderDirection = [0,0,1,1];
      //give it a random position on the canvas.
      piece.cx = game.rnd.between(100, game.width-100);
      piece.cy = game.rnd.between(100, game.height-100);

      var piece_center = new Phaser.Point((x+0.5) * this.apw, (y+0.5)*this.aph);
      var piece_disp = new Phaser.Point((x) * this.apw, (y)*this.aph);
      var rel = function(pt){
        return Phaser.Point.subtract(pt, piece_disp);
      };

      //var piece_canvas = new PIXI.CanvasBuffer(400,400);
      var piece_canvas = new PIXI.CanvasBuffer(this.apw,this.aph);
      var context = piece_canvas.context;

      var borders = piece.borders;
      context.beginPath();
      var movedTo = false;
      for (var i = 0; i < borders.length; i++){
        var bo = borders[i];
        var reversed = piece.borderDirection[i];
        bo.getPaths().forEach(function(bezier){
          var bz = bezier.slice() // copy to perhaps reverse and make relative to piece buffer
          for(j=0;j<4;j++)
            bz[j] = Phaser.Point.subtract(bz[j], piece_disp);
          if (reversed)
            bz.reverse();
          if (movedTo == false){
            context.moveTo(bz[0].x, bz[0].y);
            movedTo = true;
          }
          context.bezierCurveTo(bz[1].x, bz[1].y, bz[2].x, bz[2].y, bz[3].x, bz[3].y);
        });
      };
      /*
      context.beginPath();
      paths.forEach(function(bz){
        context.moveTo(bz[0],bz[1]);
        context.bezierCurveTo.apply(context, bz.slice(2));
      });
     */

      //context.moveTo(188, game.rnd.between(100, game.width - 100));
      //context.bezierCurveTo(140, 10, 388, 10, 388, 170);
      //context.bezierCurveTo(0,250,0,150,game.rnd.between(100, game.width - 100), game.rnd.between(100, game.width - 100));
      var img=document.getElementById("scream");
      var pat = context.createPattern(img, "no-repeat");
      context.fillStyle = pat;
      context.fill();
      this.texture = PIXI.Texture.fromCanvas(piece_canvas.canvas);

      //piece.sprite = this.game.add.sprite(piece.cx,piece.cy, screamer);
      piece.sprite = this.game.add.sprite(piece.cx,piece.cy, this.texture);
      piece.sprite.inputEnabled = true;
      piece.sprite.input.enableDrag();
      this.setPiece(x,y, piece);
    }
  }
};
