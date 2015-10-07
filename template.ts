module template {

  var itemRE = /(.*?){{(.*?)}}/g;

  export class Template {
    private _parts:((a:any,b:any)=>string)[];
    private _defaults:any;
    constructor(templateString:string, defaults?:any) {
      var parts = [];
      var end = 0;
      var m = null;
      while (null != (m = itemRE.exec(templateString))) {
        var p = templateString.substring(end, m.index);
        if (p.length || m[1]) {
          p += m[1];
          parts.push(function(x) {return x;}.bind(null, p));
        }
        if (m[2]) {
          parts.push(function(x, v, w) {return v[x] || w[x] || '{{'+x+'}}';}.bind(null, m[2]));
        }
        end = itemRE.lastIndex;
      }
      if (end < templateString.length) {
        parts.push(function(x) {return x;}.bind(null, templateString.substring(end)));
      }

      this._parts = parts;
      this._defaults = defaults || {};
    }

    render(values:any) {
      var defaults = this._defaults;
      var str = this._parts.map((x)=>x(values, defaults));
      return str.join('');
    }
  }
}
