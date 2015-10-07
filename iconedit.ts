
///<reference path="transformer.ts" />
///<reference path="template.ts" />

module iconedit {

  import Transform = graphics.Transform;
  import Template = template.Template;

  export function $1(x):any {
    return document.querySelector(x);
  }
  export function $a(x):NodeList {
    return document.querySelectorAll(x);
  }

  export interface IColor {
    r: number;
    g: number;
    b: number;
    a?:number;
  }

  export class ColorParser {
    private static _dummy = document.createElement('span');
    private static _re = /rgb(a)?\((\d+), (\d+), (\d+)(:?, ([.\d]+))?\)/;

    public static parseColor(c:string):IColor {
      ColorParser._dummy.style.color = c;
      var cc = ColorParser._dummy.style.color;

      var m = ColorParser._re.exec(cc);
      var result = { r: undefined, g: undefined, b: undefined, a: undefined };
      if (m) {
        if (m[2]) {
          result.r = parseInt(m[2]);
          result.g = parseInt(m[3]);
          result.b = parseInt(m[4]);
        }
        if (m[1] && m[5]) {
          result.a = parseFloat(m[5]);
        }
      }
      return result;
    }

    public static contrastColor(color:IColor) {
      var result = { r:0, g:0, b:0 };
      var sum = color.r+color.g+color.b;
      if (sum < (2*128)) {
        result.r = result.g = result.b = 255;
      }
      return result;
    }

    public static alpha(color:IColor, alpha:number) {
      var result = { r:color.r, g:color.g, b:color.b, a:alpha };
      return result;
    }


    public static stringify(color:IColor):string {
      var parts = [ color.r, color.g, color.b ];
      var result;

      if (color.a) {
        parts.push(color.a);
        result = 'rgba('+parts.join(',')+')';
      } else {
        result = 'rgb('+parts.join(',')+')';
      }
      return result;
    }
  }

  export class ScaledCanvas {
    private _small:HTMLCanvasElement;
    private _large:HTMLCanvasElement;

    private _x: number;
    private _y: number;

    private _f: number;
    private _b: number;
    private _ff:number;

    private _smallCtx:CanvasRenderingContext2D;
    private _largeCtx:CanvasRenderingContext2D;

    private _flag:any;
    private _painter: ()=>void;

    private _background:string;
    private _justTrace:boolean;
    private _translucent:boolean;

    private _path:string;
    private _lineWidth:number;
    private _strokeStyle:string;
    private _fillStyle:string;

    private _rotations:number[] = [];
    private _mirrors:boolean[] = [false,false,false,false];

    private _transformers:Transform[] = [];

    private _updateListener:((any)=>void)[] = [];

    constructor(largeCanvas:HTMLCanvasElement) {
      this._small = document.createElement('canvas');
      this._large = largeCanvas;
      this.setSize(16,16);
    }

    addTransform(t:Transform) {
      if (this._transformers.every((x) => !t.equals(x))) {
        this._transformers.push(t);
      }
    }

    removeTransform(t:Transform) {
      this._transformers = this._transformers.filter((x) => !t.equals(x));
    }

    getTransforms() {
      return this._transformers.slice();
    }

    applyTransform(t:Transform, flag:boolean) {
      if (flag) {
        this.addTransform(t);
      } else {
        this.removeTransform(t);
      }
      this.requestRepaint();
    }

    applyRotation(deg, flag:boolean) {
      var a = deg/360*2*Math.PI;
      var x = this._x / 2;
      var y = this._y / 2;
      if (flag) {
        if (this._rotations.every((x)=>x!=deg)) {
          this._rotations.push(deg);
        }
      } else {
        this._rotations = this._rotations.filter((x)=>x!=deg);
      }
      this.applyTransform(Transform.identity().rotateAt(a, x,y), flag);
    }

    applyMirror(which:number, flag:boolean) {
      var t:Transform;
      var x=this._x/2, y=this._y/2;
      var a = 90/360*2*Math.PI;
      switch (which) {
        case 0: t = Transform.identity().mirrorXAt(x,y); break;
        case 1: t = Transform.identity().mirrorYAt(x,y); break;
        case 2: t = Transform.identity().mirrorXAt(x,y).rotateAt(a,x,y); break;
        case 3: t = Transform.identity().mirrorXAt(x,y).rotateAt(-a,x,y); break;
        default:
          throw new Error('unknown mirroring '+which);
      }
      this._mirrors[which] = flag;
      this.applyTransform(t, flag);
    }

    _reapplyTransforms() {
      this._transformers = [];

      for (var i = 0, n = this._rotations.length; i < n; ++i) {
        this.applyRotation(this._rotations[i], true);
      }
      for (var i = 0, n = 3; i < n; ++i) {
        this.applyMirror(i, this._mirrors[i]);
      }
      this.requestRepaint();
    }

    hasRotation(r:number):boolean {
      return -1 < this._rotations.indexOf(r);
    }

    hasMirror(m:number):boolean {
      return this._mirrors[m];
    }

    addUpdateListener(f:(any)=>void) {
      if (-1 == this._updateListener.indexOf(f)) {
        this._updateListener.push(f);
      }
    }

    removeUpdateListener(f:(any)=>void) {
      var pos = this._updateListener.indexOf(f);
      if (-1 != pos) {
        this._updateListener.splice(pos, 1);
      }
    }

    getSize():{x:number;y:number;} {
      return {
        x: this._x,
        y: this._y
      };
    }

    setSize(x:number, y:number) {
      var ui = $1('#ui');
      var body = $1('body');
      var style = window.getComputedStyle(ui);
      var margin = parseInt(style.marginLeft) + parseInt(style.marginRight);
      margin = Math.floor(margin * 1.5);
      var width = Math.min(1024, body['offsetWidth'] + -ui['offsetWidth'] + -margin);
//console.log('resize ', width, x, y);

      var cell = Math.floor(Math.min(width/x, 30));
      var b = Math.round(cell / 10);
      var f = cell - b;
      var ff = f + b;

      if (ff < 3) {
        return;
      }



      this._x = x || this._x;
      this._y = y || this._y;

      this._reapplyTransforms();

      this._b = b;
      this._f = f;
      this._ff = ff;

      this._small.width = x;
      this._small.height = y;
      this._large.width = ff*x+b;
      this._large.height = ff*y+b;
      this._smallCtx = this._small.getContext('2d');
      this._largeCtx = this._large.getContext('2d');

      this.requestRepaint();
    }

    setTrace(flag:boolean) {
      this._justTrace = flag;
      this.requestRepaint();
    }

    setTranslucent(flag:boolean) {
      this._translucent = flag;
      this.requestRepaint();
    }

    setPath(path:string) {
      this._path = path;
      this.requestRepaint();
    }

    setLineWidth(lineWidth:string) {
      this._lineWidth = parseFloat(lineWidth);
      this.requestRepaint();
    }

    setStrokeStyle(style:string) {
      this._strokeStyle = style;
      this.requestRepaint();
    }

    setFillStyle(style:string) {
      this._fillStyle = style;
      this.requestRepaint();
    }

    setBackground(style:string) {
      this._background = style;
      this.requestRepaint();
    }

    setConfig(config:any) {
      var item          = config.items[0];
      this._path        = item.path;
      this._lineWidth   = item.lineWidth;
      this._strokeStyle = item.strokeStyle;
      this._fillStyle   = item.fillStyle;

      this._background   = config.background;
      this._justTrace    = config.justTrace;
      this._translucent  = config.translucent;

      this._rotations = (config.rotations || []).slice();
      this._mirrors = (config.mirrors || []).slice();

      this.setSize(config.x, config.y);
    }

    _pushConfig() {
      if (this._updateListener.length) {
        var config = {
          x: this._x,
          y: this._y,
          background: this._background,
          justTrace: this._justTrace,
          translucent: this._translucent,
          rotations: this._rotations.slice(),
          mirrors: this._mirrors.slice(),
          items: [{
            path: this._path,
            lineWidth: this._lineWidth,
            strokeStyle: this._strokeStyle,
            fillStyle: this._fillStyle
          }]
        };
        for (var i=0,n=this._updateListener.length; i<n; ++i) {
          this._updateListener[i](config);
        }
      }
    }

    _repaintPath(ctx, scale:number=1.0, justStroke=false, justTrace=false) {
      if (!justStroke) {
        ctx.clearRect(0,0, this._x, this._y);
        if (this._background) {
          ctx.fillStyle = this._background;
          ctx.fillRect(0,0, this._x, this._y);
        }
      }
      ctx.save();
      var path2d = new window['Path2D'](this._path);
      if (this._fillStyle && !justStroke && path2d) {
        ctx.fillStyle = this._fillStyle;
        if (this._transformers.length) {
          for (var i = 0, n = this._transformers.length; i < n; ++i) {
            ctx.save();
            this._transformers[i].apply(ctx);
            (<any>ctx)['fill'](path2d);
            ctx.restore();
          }

        } else {
          (<any>ctx)['fill'](path2d);
        }
      }
      if (this._strokeStyle || justStroke) {
        var style = this._strokeStyle || this._fillStyle;
        if (style && justStroke && this._translucent) {
          var color = ColorParser.parseColor(style);
          style = ColorParser.stringify(ColorParser.alpha(color, 0.4));
        }
        ctx.strokeStyle = style || 'transparent';
        ctx.lineWidth = this._lineWidth / (justTrace ? scale : 1.0);

        if (this._transformers.length) {
          for (var i = 0, n = this._transformers.length; i < n; ++i) {
            ctx.save();
            this._transformers[i].apply(ctx);
            (<any>ctx)['stroke'](path2d);
            ctx.restore();
          }

        } else {
          (<any>ctx)['stroke'](path2d);
        }
      }
      ctx.restore();
    }

    repaint() {
      this._repaintPath(this._smallCtx);

      var imagedata = this._smallCtx.getImageData(0,0, this._x,this._y);

      var ctx = this._largeCtx;

      //ctx.clearRect(0,0, this._large.width, this._large.height);
      ctx.fillStyle = '#fff';
      var width = this._large.width;
      var height = this._large.height;
        ctx.fillRect(0,0, width, height);
      ctx.save();

      ctx.beginPath();

      var x = this._x;
      var f = this._f;
      var ff = this._ff;
      var border = this._b;

      var index = 0;
      var bytes = imagedata.data;

      var ys = border;
      var xs = border;
      for (var yi = 0, yn = this._y; yi < yn; ++yi) {
        for (var xi = 0, xn = this._x; xi < xn; ++xi) {
          var red = bytes[index];
          var green = bytes[index+1];
          var blue = bytes[index+2];
          var alpha = bytes[index+3];
          if (alpha > 0) {
            var style = 'rgba('+red+','+green+','+blue+','+(alpha/255)+')';
            //console.log(style);
            ctx.fillStyle = style;
            ctx.fillRect(xs,ys, f, f);
          }
          if (border > 1) {
            ctx.rect(xs,ys, f, f);
          }

          index += 4;
          xs += ff;
        }
        xs = border;
        ys += ff;
      }

      if (border <= 1) {
        for (var yi = 0, yn = this._y; yi <= yn; ++yi) {
          ctx.moveTo(0,yi*ff+border-0.5);
          ctx.lineTo(width,yi*ff+border-0.5);
        }
        for (var xi = 0, xn = this._x; xi <= xn; ++xi) {
          ctx.moveTo(xi*ff+border-0.5, 0);
          ctx.lineTo(xi*ff+border-0.5, height);
        }
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();

      ctx.translate(border/2, border/2);
      ctx.scale(ff,ff);

      var stroke = ColorParser.parseColor(this._strokeStyle || this._fillStyle);
      var shadow = ColorParser.stringify(ColorParser.contrastColor(stroke));
      ctx.shadowColor = shadow;
      ctx.shadowBlur = 2*border+(this._lineWidth / (this._justTrace ? ff : 1));
      this._repaintPath(ctx, ff, true, this._justTrace);

      ctx.restore();
    }

    requestRepaint() {
      if (!this._flag) {
        if (!this._painter) {
          this._painter = (function() {
            this.repaint();
            this._flag = null;
          }).bind(this);
        }
        this._flag = requestAnimationFrame(this._painter);
      }
      this._pushConfig();
    }
  }

  export var scaledCanvas = new ScaledCanvas(<HTMLCanvasElement>$1('#canvaswrapper canvas'));

  export function updateCanvas() {
    var nx = (<HTMLInputElement>$1('#nx'));
    var x = parseInt(nx.value);
    var ny = (<HTMLInputElement>$1('#ny'));
    var y = parseInt(ny.value);
    console.log('prepare canvas for '+x+','+y);

    scaledCanvas.setSize(x,y);

    var newSize = scaledCanvas.getSize();
    if (x != newSize.x) {
      nx.value = ''+newSize.x;
    }
    if (y != newSize.y) {
      ny.value = ''+newSize.y;
    }
  }

  export function adjustSize(delta, factor:number = 1.0) {
    var nx = (<HTMLInputElement>$1('#nx'));
    var ny = (<HTMLInputElement>$1('#ny'));
    var x = parseInt(nx.value);
    var y = parseInt(ny.value);

    nx.value = ''+Math.floor(factor*x+delta);
    ny.value = ''+Math.floor(factor*y+delta);
    updateCanvas();
  }

  export function bindValue(element, f) {
    var ff = function() { f(element.value); };
    element.addEventListener('keyup', ff);
    element.addEventListener('change', ff);
    f(element.value);
  }

  export function bindCheckbox(element, f) {
    var ff = function() { f(element.checked); };
    element.addEventListener('keyup', ff);
    element.addEventListener('change', ff);
    f(element.checked);
  }

  function processHash() {
    var hash = location.hash.substring(1);
    var eq = hash.indexOf('=');
    var tag = hash.substring(0,eq);
    var rest = decodeURIComponent(hash.substring(eq+1));
    console.log(tag, rest, window.location.hash);

    switch (tag) {
      case 'path':
        $1('#path').value = rest;
        scaledCanvas.setPath(rest);
        break;
      case 'config':
        var config = JSON.parse(rest);
        $1('#nx').value = config.x;
        $1('#ny').value = config.y;
        $1('#path').value = config.items[0].path;
        $1('#lw').value = config.items[0].lineWidth;
        $1('#str').value = config.items[0].strokeStyle;
        $1('#fll').value = config.items[0].fillStyle;
        $1('#bg').value = config.background;
        $1('#trc').checked = config.justTrace;
        $1('#tlc').checked = config.translucent;
        scaledCanvas.setConfig(config);
        var cb:HTMLInputElement;
        for (var i = 0; i < 360; i+=45) {
          cb = $1('#rot'+i);
          if (scaledCanvas.hasRotation(i)) { cb.checked = true; }
        }
        cb = $1('#mirrX');
        if (scaledCanvas.hasMirror(0)) { cb.checked = true; }
        cb = $1('#mirrY');
        if (scaledCanvas.hasMirror(1)) { cb.checked = true; }
        cb = $1('#mirrXY');
        if (scaledCanvas.hasMirror(2)) { cb.checked = true; }
        cb = $1('#mirrXnY');
        if (scaledCanvas.hasMirror(3)) { cb.checked = true; }
        break;
    }
  }

  var isReady = false;
  var docready = function () {

    if (isReady) return;
    isReady = true;

    $1('#nx').addEventListener('change', updateCanvas);
    $1('#ny').addEventListener('change', updateCanvas);
    $1('#nx').addEventListener('keyup',  updateCanvas);
    $1('#ny').addEventListener('keyup',  updateCanvas);

    bindValue($1('#path'), scaledCanvas.setPath.bind(scaledCanvas));
    bindValue($1('#lw'),   scaledCanvas.setLineWidth.bind(scaledCanvas));
    bindValue($1('#str'),  scaledCanvas.setStrokeStyle.bind(scaledCanvas));
    bindValue($1('#fll'),  scaledCanvas.setFillStyle.bind(scaledCanvas));
    bindValue($1('#bg'),   scaledCanvas.setBackground.bind(scaledCanvas));
    bindCheckbox($1('#trc'), scaledCanvas.setTrace.bind(scaledCanvas));
    bindCheckbox($1('#tlc'), scaledCanvas.setTranslucent.bind(scaledCanvas));

    var cb:HTMLInputElement;
    for (var i = 0; i < 360; i+=45) {
      cb = $1('#rot'+i);
      bindCheckbox(cb, scaledCanvas.applyRotation.bind(scaledCanvas, i));
    }
    cb = $1('#mirrX');
    bindCheckbox(cb,   scaledCanvas.applyMirror.bind(scaledCanvas,0));
    cb = $1('#mirrY');
    bindCheckbox(cb,   scaledCanvas.applyMirror.bind(scaledCanvas,1));
    cb = $1('#mirrXY');
    bindCheckbox(cb,  scaledCanvas.applyMirror.bind(scaledCanvas,2));
    cb = $1('#mirrXnY');
    bindCheckbox(cb, scaledCanvas.applyMirror.bind(scaledCanvas,3));

    updateCanvas();

    $1('#sizePlus').addEventListener('click',   adjustSize.bind(null, 1, 1.0));
    $1('#sizeMinus').addEventListener('click',  adjustSize.bind(null,-1, 1.0));
    $1('#sizeDouble').addEventListener('click', adjustSize.bind(null, 0, 2.0));
    $1('#sizeHalf').addEventListener('click',   adjustSize.bind(null, 0, 0.5));

    var NL = '\r\n';
    var svgTemplate = (
      '<?xml version="1.0" encoding="UTF-8"?>' + NL
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{w}} {{h}}"' + NL
      + ' width="{{w}}" height="{{h}}">' + NL
      + '{{content}}'
      + '</svg>' + NL
    );

    var pathTemplate = (
        '  <path ' + NL
        + '   fill="{{fill}}"' + NL
        + '   stroke="{{stroke}}"' + NL
        + '   stroke-width="{{width}}"' + NL
        + '   d="{{path}}"/>' + NL
    );
    var xformTemplate = (
        '  <g transform="{{transform}}">' + NL
        +'{{pathSvg}}' + NL
        + '</g>' + NL
    );

    var templateSvg = new Template(svgTemplate);
    var templatePath = new Template(pathTemplate);
    var templateXform = new Template(xformTemplate);

    window.addEventListener('resize', updateCanvas);


    var renderSVG = function(config) {
      var pathSVG = templatePath.render({
          fill: config.items[0].fillStyle,
          stroke: config.items[0].strokeStyle,
          width: config.items[0].lineWidth,
          path:  config.items[0].path
      });

      var content;
      var transforms = scaledCanvas.getTransforms();
      if (transforms.length) {
        transforms.forEach((x:Transform)=>{
          var xf = templateXform.render({
            transform: x.toSVGString(),
            pathSvg: pathSVG
          });
          content += xf;
        });
      } else {
        content = pathSVG
      }

      var svg = templateSvg.render({
        w: config.x,
        h: config.y,
        content: content
      });

      return svg;
    }

    scaledCanvas.addUpdateListener(function(config) {
      var txtConfig = JSON.stringify(config);
      var urlConfig = encodeURIComponent(txtConfig);
      $1('#permalink').href = '#config='+urlConfig;
      var svgcode = $1('#svgcode');
      var svgText = renderSVG(config);
      if (undefined !== svgcode.textContent) {
        svgcode.textContent = svgText;
      } else {
        svgcode.innerText = svgText;
      }

      var svgurl = 'data:image/svg+xml;base64,'+ btoa(svgText);

      $1('#svgurl').href = svgurl;
      $1('#svgimg').src = svgurl;
    });


    window.addEventListener('hashchange', processHash);
    if (window.location.hash) {
      processHash();
    }

    scaledCanvas._pushConfig();
  };

  document.addEventListener('DOMContentReady', docready);

  document.addEventListener('readystatechange', function() {
    switch (document.readyState) {
      case 'complete':
        docready();
        break;
      default:
        console.log('document not complete: '+document.readyState);
        break;
    }
  });

}
