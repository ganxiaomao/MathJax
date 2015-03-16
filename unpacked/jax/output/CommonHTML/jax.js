/* -*- Mode: Javascript; indent-tabs-mode:nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */

/*************************************************************
 *
 *  MathJax/jax/output/CommonHTML/jax.js
 *
 *  Implements the CommonHTML OutputJax that displays mathematics
 *  using HTML and CSS to position the characters from math fonts
 *  in their proper locations.  Unlike the HTML-CSS output jax,
 *  this HTML is browswer and OS independent.
 *  
 *  ---------------------------------------------------------------------
 *  
 *  Copyright (c) 2013-2015 The MathJax Consortium
 * 
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


(function (AJAX,HUB,HTML,CHTML) {
  var MML;

  var EVENT, TOUCH, HOVER; // filled in later

  var SCRIPTFACTOR = Math.sqrt(1/2),
      AXISHEIGHT = .25,
      STRUTHEIGHT = 1,
      AFUZZ = .08, HFUZZ = .025, DFUZZ = .025;  // adjustments to bounding box of character boxes

  var STYLES = {
    ".MathJax_CHTML_Display": {
      "display":    "block",
      "text-align": "center",
      "margin":     "1em 0"
    },

    "mjx-math":   {
      "display":        "inline-block",
      "line-height":    0,
      "text-indent":    0,
      "white-space":    "nowrap",
      "border-collapse":"collapse"
    },
    "mjx-math *": {display:"inline-block", "text-align":"left"},

    "mjx-numerator":   {display:"block", "text-align":"center"},
    "mjx-denominator": {display:"block", "text-align":"center"},
    ".MJXc-fpad": {"padding-left":".1em", "padding-right":".1em"},
    ".MJXc-bevelled > *": {display:"inline-block"},
    
    "mjx-stack":  {display:"inline-block"},
    "mjx-op":     {display:"block"},
    "mjx-under":  {display:"table-cell"},
    "mjx-over":   {display:"block"},
    
    "mjx-stack > mjx-sup": {display:"block"},
    "mjx-stack > mjx-sub": {display:"block"},
    
    "mjx-delim-v > mjx-char": {transform:"scale(1)"},  // for Firefox to get horizontal alignment better
    "mjx-delim-h": {display:"block"},
    "mjx-delim-h > mjx-char": {
      transform:"scale(1)",
      display:"inline-block",
      "vertical-align":"top"
    },
    
    "mjx-surd": {"vertical-align":"top"},
    
    "mjx-mphantom": {visibility:"hidden"},

    "mjx-merror": {
      "background-color":"#FFFF88",
      color:             "#CC0000",
      border:            "1px solid #CC0000",
      padding:           "2px 3px",
      "font-style":      "normal",
      "font-size":       "90%"
    },

    "mjx-box":    {display:"inline-block"},
    "mjx-block":  {display:"block"},
    "mjx-char":   {display:"block"},
    "mjx-itable": {display:"inline-table"},
    "mjx-row":    {display:"table-row"},
    "mjx-cell":   {display:"table-cell"},
    "mjx-table":  {display:"table", width:"100%"},
    "mjx-line":   {display:"block", width:"100%", "border-top":"0 solid"},
    "mjx-strut":  {width:0, "padding-top":STRUTHEIGHT+"em"},

    ".MJXc-script": {"font-size":SCRIPTFACTOR+"em"},
    ".MJXc-space1": {"margin-left":".167em"},
    ".MJXc-space2": {"margin-left":".222em"},
    ".MJXc-space3": {"margin-left":".278em"},
    
    "mjx-chartest": {
      display:"block",
      visibility: "hidden",
      position:"absolute", top:0,
      "line-height":"normal",
      "font-size":"500%"
    },
    "mjx-chartest mjx-char": {display:"inline"},
    "mjx-chartest mjx-box": {"padding-top": "500px"},

/*********************************/
    
    "mjx-mtable": {"vertical-align":AXISHEIGHT+"em", "margin":"0 .125em"},
    "mjx-mtable > span": {"display":"inline-table!important", "vertical-align":"middle"},
    "mjx-mtr": {"display":"table-row!important"},
    "mjx-mtd": {"display":"table-cell!important", "text-align":"center", "padding":".5em 0 0 .5em"},
    "mjx-mtr > mjx-mtd:first-child": {"padding-left":0},
    "mjx-mtr:first-child > mjx-mtd": {"padding-top":0},
    "mjx-mlabeledtr": {"display":"table-row!important"},
    "mjx-mlabeledtr > mjx-mtd:first-child": {"padding-left":0},
    "mjx-mlabeledtr:first-child > mjx-mtd": {"padding-top":0}    
  };
  
  
  /************************************************************/
  
  var BIGDIMEN = 1000000;
  var V = "V", H = "H";

  CHTML.Augment({
    settings: HUB.config.menuSettings,
    config: {styles: STYLES},

    /********************************************/
    
    Config: function () {
      if (!this.require) {this.require = []}
      this.SUPER(arguments).Config.call(this); var settings = this.settings;
      if (settings.scale) {this.config.scale = settings.scale}
      this.require.push(this.fontDir+"/TeX/fontdata.js");
      this.require.push(MathJax.OutputJax.extensionDir+"/MathEvents.js");
    },

    Startup: function () {
      //
      //  Set up event handling
      //
      EVENT = MathJax.Extension.MathEvents.Event;
      TOUCH = MathJax.Extension.MathEvents.Touch;
      HOVER = MathJax.Extension.MathEvents.Hover;
      this.ContextMenu = EVENT.ContextMenu;
      this.Mousedown   = EVENT.AltContextMenu;
      this.Mouseover   = HOVER.Mouseover;
      this.Mouseout    = HOVER.Mouseout;
      this.Mousemove   = HOVER.Mousemove;

      //
      //  Determine pixels per inch
      //
      var div = HTML.addElement(document.body,"div",{style:{width:"5in"}});
      this.pxPerInch = div.offsetWidth/5; div.parentNode.removeChild(div);

      //
      //  Set up styles and preload web fonts
      //
      return AJAX.Styles(this.config.styles,["InitializeCHTML",this]);
    },
    InitializeCHTML: function () {
    },

    //
    //  Load data for a font
    //
    loadFont: function (font) {
      HUB.RestartAfter(AJAX.Require(this.fontDir+"/"+font));
    },
    //
    //  Signal that the font data are loaded
    //
    fontLoaded: function (font) {
      if (!font.match(/-|fontdata/)) font += "-Regular";
      if (!font.match(/\.js$/)) font += ".js"
      MathJax.Callback.Queue(
        ["Post",HUB.Startup.signal,["CommonHTML - font data loaded",font]],
        ["loadComplete",AJAX,this.fontDir+"/"+font]
      );
    },
    

    /********************************************/
    
    preTranslate: function (state) {
      var scripts = state.jax[this.id], i, m = scripts.length,
          script, prev, span, div, jax;
      //
      //  Loop through the scripts
      //
      for (i = 0; i < m; i++) {
        script = scripts[i]; if (!script.parentNode) continue;
        //
        //  Remove any existing output
        //
        prev = script.previousSibling;
        if (prev && String(prev.className).match(/^MathJax_CHTML(_Display)?( MathJax_Processing)?$/))
          {prev.parentNode.removeChild(prev)}
        //
        //  Add the span, and a div if in display mode,
        //  then set the role and mark it as being processed
        //
        jax = script.MathJax.elementJax; if (!jax) continue;
        jax.CHTML = {display: (jax.root.Get("display") === "block")}
        span = div = HTML.Element("span",{
          className:"MathJax_CHTML", id:jax.inputID+"-Frame", isMathJax:true, jaxID:this.id,
          oncontextmenu:EVENT.Menu, onmousedown: EVENT.Mousedown,
          onmouseover:EVENT.Mouseover, onmouseout:EVENT.Mouseout, onmousemove:EVENT.Mousemove,
          onclick:EVENT.Click, ondblclick:EVENT.DblClick
        });
        if (HUB.Browser.noContextMenu) {
          span.ontouchstart = TOUCH.start;
          span.ontouchend = TOUCH.end;
        }
        if (jax.CHTML.display) {
          div = HTML.Element("div",{className:"MathJax_CHTML_Display"});
          div.appendChild(span);
        }
        //
        div.className += " MathJax_Processing";
        script.parentNode.insertBefore(div,script);
      }
      /* 
       * state.CHTMLeqn = state.CHTMLlast = 0; state.CHTMLi = -1;
       * state.CHTMLchunk = this.config.EqnChunk;
       * state.CHTMLdelay = false;
       */
    },

    /********************************************/
    
    Translate: function (script,state) {
      if (!script.parentNode) return;

      /* 
       * //
       * //  If we are supposed to do a chunk delay, do it
       * //  
       * if (state.CHTMLdelay) {
       *   state.CHTMLdelay = false;
       *   HUB.RestartAfter(MathJax.Callback.Delay(this.config.EqnChunkDelay));
       * }
       */

      //
      //  Get the data about the math
      //
      var jax = script.MathJax.elementJax, math = jax.root,
          span = document.getElementById(jax.inputID+"-Frame"),
          div = (jax.CHTML.display ? span.parentNode : span);
      //
      //  Typeset the math
      //
      this.initCHTML(math,span);
      math.setTeXclass();
      try {math.toCommonHTML(span)} catch (err) {
        while (span.firstChild) span.removeChild(span.firstChild);
        throw err;
      }
      //
      //  Put it in place, and remove the processing marker
      //
      div.className = div.className.split(/ /)[0];
      //
      //  Check if we are hiding the math until more is processed
      //
      if (this.hideProcessedMath) {
        //
        //  Hide the math and don't let its preview be removed
        //
        div.className += " MathJax_Processed";
        if (script.MathJax.preview) {
          jax.CHTML.preview = script.MathJax.preview;
          delete script.MathJax.preview;
        }
        /* 
         * //
         * //  Check if we should show this chunk of equations
         * //
         * state.CHTMLeqn += (state.i - state.CHTMLi); state.CHTMLi = state.i;
         * if (state.CHTMLeqn >= state.CHTMLlast + state.CHTMLchunk) {
         *   this.postTranslate(state);
         *   state.CHTMLchunk = Math.floor(state.CHTMLchunk*this.config.EqnChunkFactor);
         *   state.CHTMLdelay = true;  // delay if there are more scripts
         * }
         */
      }
    },

    initCHTML: function (math,span) {},

    /********************************************/
    
    postTranslate: function (state) {
      var scripts = state.jax[this.id];
      if (!this.hideProcessedMath) return;
      for (var i = 0, m = scripts.length; i < m; i++) {
        var script = scripts[i];
        if (script && script.MathJax.elementJax) {
          //
          //  Remove the processed marker
          //
          script.previousSibling.className = script.previousSibling.className.split(/ /)[0];
          var data = script.MathJax.elementJax.CHTML;
          //
          //  Remove the preview, if any
          //
          if (data.preview) {
            data.preview.innerHTML = "";
            script.MathJax.preview = data.preview;
            delete data.preview;
          }
        }
      }

      /* 
       * //
       * //  Reveal this chunk of math
       * //
       * for (var i = state.CHTMLlast, m = state.CHTMLeqn; i < m; i++) {
       *   var script = scripts[i];
       *   if (script && script.MathJax.elementJax) {
       *     //
       *     //  Remove the processed marker
       *     //
       *     script.previousSibling.className = script.previousSibling.className.split(/ /)[0];
       *     var data = script.MathJax.elementJax.CHTML;
       *     //
       *     //  Remove the preview, if any
       *     //
       *     if (data.preview) {
       *       data.preview.innerHTML = "";
       *       script.MathJax.preview = data.preview;
       *       delete data.preview;
       *     }
       *   }
       * }
       * //
       * //  Save our place so we know what is revealed
       * //
       * state.CHTMLlast = state.CHTMLeqn;
       */
    },

    /********************************************/
    
    getJaxFromMath: function (math) {
      if (math.parentNode.className === "MathJax_CHTML_Display") {math = math.parentNode}
      do {math = math.nextSibling} while (math && math.nodeName.toLowerCase() !== "script");
      return HUB.getJaxFor(math);
    },
    getHoverSpan: function (jax,math) {return jax.root.CHTMLnodeElement()},
    getHoverBBox: function (jax,span,math) {
//      var bbox = span.CHTML, em = jax.CHTML.outerEm;
//      var BBOX = {w:bbox.w*em, h:bbox.h*em, d:bbox.d*em};
//      if (bbox.width) {BBOX.width = bbox.width}
      return BBOX;
    },
    
    Zoom: function (jax,span,math,Mw,Mh) {
      //
      //  Re-render at larger size
      //
      span.className = "MathJax";
      this.idPostfix = "-zoom"; jax.root.toCommonHTML(span,span); this.idPostfix = "";
      //
      //  Get height and width of zoomed math and original math
      //
      span.style.position = "absolute";
      var zW = span.offsetWidth, zH = span.offsetHeight,
          mH = math.offsetHeight, mW = math.offsetWidth;
      if (mW === 0) {mW = math.parentNode.offsetWidth}; // IE7 gets mW == 0?
      span.style.position = math.style.position = "";
      //
      return {Y:-EVENT.getBBox(span).h, mW:mW, mH:mH, zW:zW, zH:zH};
    },

    Remove: function (jax) {
      var span = document.getElementById(jax.inputID+"-Frame");
      if (span) {
        if (jax.CHTML.display) {span = span.parentNode}
        span.parentNode.removeChild(span);
      }
      delete jax.CHTML;
    },
    
    /********************************************/
    
    ID: 0, idPostfix: "",
    GetID: function () {this.ID++; return this.ID},
    
    /********************************************/

    MATHSPACE: {
      veryverythinmathspace:  1/18,
      verythinmathspace:      2/18,
      thinmathspace:          3/18,
      mediummathspace:        4/18,
      thickmathspace:         5/18,
      verythickmathspace:     6/18,
      veryverythickmathspace: 7/18,
      negativeveryverythinmathspace:  -1/18,
      negativeverythinmathspace:      -2/18,
      negativethinmathspace:          -3/18,
      negativemediummathspace:        -4/18,
      negativethickmathspace:         -5/18,
      negativeverythickmathspace:     -6/18,
      negativeveryverythickmathspace: -7/18,

      thin: .04,
      medium: .06,
      thick: .1,

      infinity: BIGDIMEN
    },
    SPACECLASS: {
      thinmathspace:   "MJXc-space1",
      mediummathspace: "MJXc-space2",
      thickmathspace:  "MJXc-space3"
    },
    pxPerInch: 96,
    em: 16,
    
    FONTDEF: {},
    TEXDEF: {
      x_height:         .442,
      quad:             1,
      num1:             .676508,
      num2:             .393732,
      num3:             .44373,
      denom1:           .685951,
      denom2:           .344841,
      sup1:             .412892,
      sup2:             .362892,
      sup3:             .288888,
      sub1:             .15,
      sub2:             .247217,
      sup_drop:         .386108,
      sub_drop:         .05,
      delim1:          2.39,
      delim2:          1.0,
      axis_height:      .25,
      rule_thickness:   .06,
      big_op_spacing1:  .111111,
      big_op_spacing2:  .166666,
      big_op_spacing3:  .2,
      big_op_spacing4:  .6,
      big_op_spacing5:  .1,

      surd_height:      .1,
      
      scriptspace:         .05,
      nulldelimiterspace:  .12,
      delimiterfactor:     901,
      delimitershortfall:   .3,

      min_rule_thickness:  1.25     // in pixels
    },
    
    /********************************************************/
    
    //
    //  Get a unicode character by number (even when it takes two character)
    //
    unicodeChar: function (n) {
      if (n < 0xFFFF) return String.fromCharCode(n);
      n -= 0x10000;
      return String.fromCharCode((n>>10)+0xD800) + String.fromCharCode((N&0x3FF)+0xDC00);
    },
    //
    //  Get the unicode number of a (possibly multi-character) string
    //
    getUnicode: function (string) {
      var n = string.text.charCodeAt(string.i); string.i++;
      if (n >= 0xD800 && n < 0xDBFF) {
        n = (((n-0xD800)<<10)+(string.text.charCodeAt(string.i)-0xDC00))+0x10000;
        string.i++;
      }
      return n;
    },
    //
    //  Get the list of actions for a given character in a given variant
    //  (processing remaps, multi-character results, and so on).  Results are
    //  cached so that future lookups for the same variant/n pair will not
    //  require looking through the data again.
    //
    getCharList: function (variant,n) {
      var id, M, list = [], cache = variant.cache, N = n;
      if (cache[n]) return cache[n];
      var RANGES = this.FONTDATA.RANGES, VARIANT = this.FONTDATA.VARIANT;
      if (n >= RANGES[0].low && n <= RANGES[RANGES.length-1].high) {
        for (id = 0, M = RANGES.length; id < M; id++) {
          if (RANGES[id].name === "alpha" && variant.noLowerCase) continue;
          var N = variant["offset"+RANGES[id].offset];
          if (N && n >= RANGES[id].low && n <= RANGES[id].high) {
            if (RANGES[id].remap && RANGES[id].remap[n]) {
              n = N + RANGES[id].remap[n];
            } else {
              n = n - RANGES[id].low + N;
              if (RANGES[id].add) {n += RANGES[id].add}
            }
            if (variant["variant"+RANGES[id].offset])
              variant = VARIANT[variant["variant"+RANGES[id].offset]];
            break;
          }
        }
      }
      if (variant.remap && variant.remap[n]) {
        n = variant.remap[n];
        if (variant.remap.variant) {variant = VARIANT[variant.remap.variant]}
      } else if (this.FONTDATA.REMAP[n] && !variant.noRemap) {
        n = this.FONTDATA.REMAP[n];
      }
      if (n instanceof Array) {variant = VARIANT[n[1]]; n = n[0]} 
      if (typeof(n) === "string") {
        var string = {text:n, i:0, length:n.length};
        while (string.i < string.length) {
          n = this.getUnicode(string);
          var chars = this.getCharList(variant,n);
          if (chars) list.push.apply(list,chars);
        }
      } else {
        if (variant.cache[n]) {list = variant.cache[n]}
          else {variant.cache[n] = list = [this.lookupChar(variant,n)]}
      }
      cache[N] = list;
      return list;
    },
    //
    //  After all remapping has been done, look up a character
    //  in the fonts for a given variant, chaining to other
    //  variants as needed.  Return an undefined character if
    //  it isnt' found in the given variant.
    //
    lookupChar: function (variant,n) {
      var VARIANT = variant;
      while (variant) {
        for (var i = 0, m = variant.fonts.length; i < m; i++) {
          var font = this.FONTDATA.FONTS[variant.fonts[i]];
          if (typeof(font) === "string") this.loadFont(font);
          var C = font[n];
          if (C) {
            if (C.length === 5) C[5] = {};
            if (C.c == null) {
              C[0] /= 1000; C[1] /= 1000; C[2] /= 1000; C[3] /= 1000; C[4] /= 1000;
              C.c = this.unicodeChar(n);
            }
            if (C[5].space) return {type:"space", w:C[2], font:font};
            return {type:"char", font:font, n:n};
          } else if (font.Extra) {
            this.findBlock(font,n);
          }
        }
        variant = this.FONTDATA.VARIANT[variant.chain];
      }
      return this.unknownChar(VARIANT,n);
    },
    findBlock: function (font,n) {
      var extra = font.Extra, name = font.file, file;
      for (var i = 0, m = extra.length; i < m; i++) {
        if (typeof(extra[i]) === "number") {
          if (n === extra[i]) {file = name; break}
        } else {
          if (n <  extra[i][0]) return;
          if (n <= extra[i][1]) {file = name; break}
        }
      }
      //
      //  Currently this only loads one extra file, but that
      //  might need to be expanded in the future.
      //
      if (file) {delete font.Extra; this.loadFont(name)}
    },
    //
    //  Create a fake font entry for an unknown character.
    //
    unknownChar: function (variant,n) {
      HUB.signal.Post(["CommonHTML Jax - unknown char",n,variant]);
      var id = ""; if (variant.bold) id += "B"; if (variant.italic) id += "I";
      var unknown = this.FONTDATA.UNKNOWN[id||"R"]; // cache of previously measured characters
      if (!unknown[n]) this.getUnknownChar(unknown,n);
      return {type:"unknown", n:n, font:unknown};
    },
    getUnknownChar: function (unknown,n) {
      var c = this.unicodeChar(n);
      var HDW = this.getHDW(c,unknown.className);
      var a = (HDW.h-HDW.d)/2+AFUZZ; // ### FIXME:  is this really the axis of the surrounding text?
      // ### FIXME:  provide a means of setting the height and depth for individual characters
      unknown[n] = [.8,.2,HDW.w,0,HDW.w,{a:a, A:HDW.h-a, d:HDW.d}];
      unknown[n].c = c;
    },
    styledText: function (variant,text) {
      HUB.signal.Post(["CommonHTML Jax - styled text",text,variant]);
      var style = variant.style;
      var id = "_"+style.family;
      if (style.weight) id += "_"+style.weight;
      if (style.style)  id += "_"+style.style;
      if (!this.STYLEDTEXT) this.STYLEDTEXT = {};
      if (!this.STYLEDTEXT[id]) this.STYLEDTEXT[id] = {cache:{}, className:""};
      var unknown = this.STYLEDTEXT[id];
      if (!unknown["_"+text]) {
        var HDW = this.getHDW(text,"",style);
        var a = (HDW.h-HDW.d)/2+AFUZZ; // ### FIXME:  is this really the axis of the surrounding text?
        unknown["_"+text] = [.8,.2,HDW.w,0,HDW.w,{a:a, A:HDW.h-a, d:HDW.d}];
        unknown["_"+text].c = text;
      }
      return {type:"unknown", n:"_"+text, font:unknown, style:style};
    },

    //
    //  Get the height, depth and width of a character
    //  (height and depth are of the font, not the character).
    //  WARNING:  causes reflow of the page!
    //
    getHDW: function (c,name,styles) {
      var test1 = HTML.addElement(document.body,"mjx-chartest",{className:name,style:styles},[["mjx-char",{},[c]]]);
      var test2 = HTML.addElement(document.body,"mjx-chartest",{className:name,style:styles},[["mjx-char",{},[c,["mjx-box"]]]]);
      var em = window.parseFloat(window.getComputedStyle(test1).fontSize);
      var d = (test2.offsetHeight-500)/em;
      var w = test1.offsetWidth/em, h = test1.offsetHeight/em - d;
      document.body.removeChild(test1);
      document.body.removeChild(test2);
      return {h:h, d:d, w:w}
    },
    

    /********************************************************/
    
    //
    //  Process a character list into a given node and return
    //  the updated bounding box.
    //
    addCharList: function (node,list,bbox) {
      var state = {text:"", className:null};
      for (var i = 0, m = list.length; i < m; i++) {
        var item = list[i];
        if (this.charList[item.type]) (this.charList[item.type])(item,node,bbox,state,m);
      }
      if (state.text !== "") {
        if (node.childNodes.length) {
          HTML.addElement(node,"span",{className:state.className},[state.text]);
        } else {
          HTML.addText(node,state.text);
          node.className = state.className;
        }
      }
    },
    //
    //  The various item types are processed by these
    //  functions.
    //
    charList: {
      //
      //  Character from the known fonts
      //
      char: function (item,node,bbox,state,m) {
        var font = item.font;
        if (state.className && font.className !== state.className) this.flushText(node,state);
        var C = font[item.n];
        state.text += C.c; state.className = font.className;
        if (bbox.h < C[0]) bbox.t = bbox.h = C[0];
        if (bbox.d < C[1]) bbox.b = bbox.d = C[1];
        if (bbox.l > bbox.w+C[3]) bbox.l = bbox.w+C[3];
        if (bbox.r < bbox.w+C[4]) bbox.r = bbox.w+C[4];
        bbox.w += C[2];
        if (m == 1 && font.skew && font.skew[item.n]) bbox.skew = font.skew[item.n];
        if (C[5].rfix) this.flushText(node,state).style.marginRight = CHTML.Em(C[5].rfix/1000);
      },
      //
      //  Space characters (not actually in the fonts)
      //
      space: function (item,node,bbox,state) {
        if (item.w) {
          if (state.text === "") state.className = item.font.className;
          this.flushText(node,state).style.marginRight = CHTML.Em(item.w);
          bbox.w += item.w;
        }
      },
      //
      //  An unknown character (one not in the font data)
      //
      unknown: function (item,node,bbox,state) {
        this.char(item,node,bbox,state,0);
        node = this.flushText(node,state,item.style);
        node.style.lineHeight = "normal";
        var C = item.font[item.n];
        node.style.marginTop = CHTML.Em(-C[5].A-HFUZZ);
        node.style.marginBottom = CHTML.Em(-C[5].d-DFUZZ);
        node.style.width = CHTML.Em(C[2]);
        if (!bbox.a || C[5].a > bbox.a) bbox.a = C[5].a;
      },
      //
      //  Put the pending text into a box of the class, and
      //  reset the data about the text.
      //
      flushText: function (node,state,style) {
        node = HTML.addElement(node,"mjx-charbox",
          {className:state.className,style:style},[state.text]);
        state.text = ""; state.className = null;
        return node;
      }
    },

    //
    //  Add the given text (in the given variant) into the given node, and
    //  update the bounding box of the result.  Make sure the node's DOM
    //  bounding box matches the contents.
    //
    handleText: function (node,text,variant,bbox) {
      if (node.childNodes.length === 0) {
        HTML.addElement(node,"mjx-char");
        bbox = CHTML.BBOX.empty();
      }
      if (typeof(variant) === "string") variant = this.FONTDATA.VARIANT[variant];
      if (!variant) variant = this.FONTDATA.VARIANT[MML.VARIANT.NORMAL];
      var string = {text:text, i:0, length:text.length}, list = [];
      if (variant.style && string.length) {
        list.push(this.styledText(variant,text));
      } else {
        while (string.i < string.length) {
          var n = this.getUnicode(string);
          list.push.apply(list,this.getCharList(variant,n));
        }
      }
      if (list.length) this.addCharList(node.firstChild,list,bbox);
      bbox.clean();
      bbox.h += HFUZZ; bbox.d += DFUZZ; bbox.t += HFUZZ; bbox.b += DFUZZ;
      node.firstChild.style[bbox.h < 0 ? "marginTop" : "paddingTop"] = this.Em(bbox.h-(bbox.a||0));
      node.firstChild.style[bbox.d < 0 ? "marginBottom": "paddingBottom"] = this.Em(bbox.d);
      return bbox;
    },

    /********************************************************/

    createDelimiter: function (node,code,HW,scale,font) {
      var bbox = this.BBOX.zero();
      if (!code) {
        bbox.w = bbox.r = this.TEX.nulldelimiterspace;
        HTML.addElement(node,"mjx-box",{style:{width:bbox.w}});
        return bbox;
      }
      if (!scale) scale = 1;
      if (!(HW instanceof Array)) HW = [HW,HW];
      var hw = HW[1]; HW = HW[0];
      var delim = {alias: code};
      while (delim.alias) {
        code = delim.alias; delim = this.FONTDATA.DELIMITERS[code];
        if (!delim) {delim = {HW: [0,this.FONTDATA.VARIANT[MML.VARIANT.NORMAL]]}}
      }
      if (delim.load) HUB.RestartAfter(AJAX.Require(this.fontDir+"/TeX/fontdata-"+delim.load+".js"));
      for (var i = 0, m = delim.HW.length; i < m; i++) {
        if (delim.HW[i][0]*scale >= HW-.01 || (i == m-1 && !delim.stretch)) {
          if (delim.HW[i][2]) scale *= delim.HW[i][2];
          if (delim.HW[i][3]) code = delim.HW[i][3];
          var BBOX = this.createChar(node,[code,delim.HW[i][1]],scale,font);
          BBOX.offset = .6 * BBOX.w;
          return BBOX;
        }
      }
      if (!delim.stretch) return bbox;
      return this["extendDelimiter"+delim.dir](node,hw,delim.stretch,scale,font);
    },
    extendDelimiterV: function (node,H,delim,scale,font) {
      node = HTML.addElement(node,"mjx-delim-v"); var tmp = HTML.Element("span");
      var top, bot, mid, ext, tbox, bbox, mbox, ebox, k = 1;
      tbox = this.createChar(tmp,(delim.top||delim.ext),scale,font); top = tmp.removeChild(tmp.firstChild);
      bbox = this.createChar(tmp,(delim.bot||delim.ext),scale,font); bot = tmp.removeChild(tmp.firstChild);
      mbox = ebox = this.BBOX.zero();
      var h = tbox.h + tbox.d + bbox.h + bbox.d;
      node.appendChild(top);
      if (delim.mid) {
        mbox = this.createChar(tmp,delim.mid,scale,font); mid = tmp.removeChild(tmp.firstChild);
        h += mbox.h + mbox.d; k = 2;
      }
      if (delim.min && H < h*delim.min) H = h*delim.min;
      if (H > h) {
        ebox = this.createChar(tmp,delim.ext,scale,font); ext = tmp.removeChild(tmp.firstChild);
        if (delim.fullExtenders) {
          var n = Math.ceil((H-h)/(k*(ebox.h+ebox.d)*.9));
          H = .9*n*k*(ebox.h+ebox.d) + h;
        }
        var s = 1.1*(H - h)/k + .3;  // space to cover by extender
        s /= (ebox.h+ebox.d);          // scale factor;
        this.Transform(ext,
          "translateY("+CHTML.Em(-ebox.d+.25)+") scaleY("+s.toFixed(3).replace(/0+$/,"")+")",
          "left "+CHTML.Em(ebox.d)
        );
        ext.style.paddingTop=ext.style.paddingBottom = 0;
        top.style.marginBottom = CHTML.Em((H-h)/k);
        node.appendChild(ext);
        if (delim.mid) {
          node.appendChild(mid);
          mid.style.marginBottom = top.style.marginBottom;
          node.appendChild(ext.cloneNode(true));
        }
      } else {
        H = h - .25; top.style.marginBottom = "-.25em";
        if (delim.mid) {
          node.appendChild(mid);
          mid.style.marginBottom = "-.3em"; H -= .1;
        }
      }
      node.appendChild(bot);
      var BBOX = {
        w:  Math.max(tbox.w,ebox.w,bbox.w,mbox.w),
        l: Math.min(tbox.l,ebox.l,bbox.l,mbox.l),
        r: Math.max(tbox.r,ebox.r,bbox.r,mbox.r),
        h: H-bbox.d, d: bbox.d, t: H-bbox.d, b: bbox.d
      };
      BBOX.offset = .5 * BBOX.w;
      return BBOX;
    },
    extendDelimiterH: function (node,W,delim,scale,font) {
      node = HTML.addElement(node,"mjx-delim-h"); var tmp = HTML.Element("span");
      var left, right, mid, ext, ext2, lbox, rbox, mbox, ebox, k = 1;
      lbox = this.createChar(tmp,(delim.left||delim.rep),scale,font); left = tmp.removeChild(tmp.firstChild);
      rbox = this.createChar(tmp,(delim.right||delim.rep),scale,font); right = tmp.removeChild(tmp.firstChild);
      node.appendChild(left); 
      var BBOX = this.BBOX.zero(); 
      BBOX.h = Math.max(lbox.h,rbox.h); BBOX.d = Math.max(lbox.d,rbox.d);
      left.style.marginLeft = CHTML.Em(-lbox.l); left.style.marginRight = CHTML.Em(lbox.r-lbox.w);
      right.style.marginleft = CHTML.Em(-rbox.l); right.style.marginRight = CHTML.Em(rbox.r-rbox.w);
      var w = (lbox.r - lbox.l) + (rbox.r - rbox.l) - .05;
      if (delim.mid) {
        mbox = this.createChar(tmp,delim.mid,scale,font);
        mid = tmp.removeChild(tmp.firstChild);
        w += mbox.w; k = 2;
        if (mbox.h > BBOX.h) BBOX.h = mbox.h;
        if (mbox.d < BBOX.d) BBOX.d = mbox.d;
      }
      if (delim.min && W < w*delim.min) W = w*delim.min;
      right.style.marginLeft = CHTML.Em((W-w-rbox.l)/k);
      BBOX.w = BBOX.r = W;
      if (W > w) {
        ebox = this.createChar(tmp,delim.rep,scale,font); ext = tmp.removeChild(tmp.firstChild);
        if (ebox.h > BBOX.h) BBOX.h = ebox.h;
        if (ebox.d < BBOX.d) BBOX.d = ebox.d;
        var s = (W - w)/k + .2;  // space to cover by extender
        s /= (ebox.r - ebox.l);        // scale factor
        this.Transform(ext,
          "translateX("+CHTML.Em(-ebox.l-.1)+") scaleX("+s.toFixed(3).replace(/0+$/,"")+")",
          CHTML.Em(ebox.l)+" center"
        );
        ext.style.width = 0;
        node.appendChild(ext);
        if (delim.mid) {
          node.appendChild(mid);
          mid.style.marginLeft = right.style.marginLeft;
          ext2 = node.appendChild(ext.cloneNode(true));
        }
      } else {
        if (delim.mid) {
          node.appendChild(mid);
          mid.style.marginLeft = CHTML.Em((W-w)/k);
        }
      }
      node.appendChild(right);
      this.adjustTops([left,ext,mid,ext2,right]);
      BBOX.t = BBOX.h; BBOX.b = BBOX.d;
      if (ext) {
        if (BBOX.h !== ebox.h) node.style.marginTop = CHTML.Em(ebox.h - BBOX.h);
        if (BBOX.d !== ebox.d) node.style.marginBottom = CHTML.Em(ebox.d - BBOX.d);
        BBOX.h = ebox.h; BBOX.d = ebox.d;
      }
      return BBOX;
    },
    adjustTops: function (nodes) {
      //
      //  to get alignment right in horizontal delimiters, we force all
      //  the elements to the same height and align to top
      //
      var i, m = nodes.length, T = 0;
      for (i = 0; i < m; i++) {
        if (nodes[i] && nodes[i].style.paddingTop) {
          var t = this.unEm(nodes[i].style.paddingTop);
          if (t > T) T = t;
        }
      }
      for (i = 0; i < m; i++) if (nodes[i]) nodes[i].style.paddingTop = CHTML.Em(T);
    },
    createChar: function (node,data,scale,font) {
      // ### FIXME: handle cache better (by data[1] and font)
      var text = "", variant = {fonts: [data[1]], noRemap:true, cache:{}};
      if (font && font === MML.VARIANT.BOLD) variant.fonts = [data[1]+"-bold",data[1]];
      if (typeof(data[1]) !== "string") variant = data[1];
      if (data[0] instanceof Array) {
        for (var i = 0, m = data[0].length; i < m; i++) text += String.fromCharCode(data[0][i]);
      } else text = String.fromCharCode(data[0]);
      if (data[4]) scale *= data[4];
      if (scale !== 1) node.style.fontSize = this.Percent(scale);
      var bbox = this.handleText(node,text,variant);
      if (data[2]) {  // x offset
        node.style.paddingLeft = this.Em(data[2]);
        bbox.w += data[2]; bbox.r += data[2];
      }
      if (data[3]) {  // y offset
        node.style.verticalAlign = this.Em(data[3]);
        bbox.h += data[3]; if (bbox.h < 0) bbox.h = 0;
      }
      if (data[5]) {  // extra height
        node.style.marginTop = this.Em(data[5]);
        bbox.h += data[5]; bbox.t += data[5];
      }
      if (data[6]) {  // extra depth
        node.style.marginBottom = this.Em(data[6]);
        bbox.d += data[6]; bbox.b += data[6];
      }
      return bbox;
    },

    /********************************************************/
    
    //
    //  ### FIXME: Handle mu's
    //
    length2em: function (length,size) {
      if (typeof(length) !== "string") {length = length.toString()}
      if (length === "") {return ""}
      if (length === MML.SIZE.NORMAL) {return 1}
      if (length === MML.SIZE.BIG)    {return 2}
      if (length === MML.SIZE.SMALL)  {return .71}
      if (this.MATHSPACE[length])     {return this.MATHSPACE[length]}
      var match = length.match(/^\s*([-+]?(?:\.\d+|\d+(?:\.\d*)?))?(pt|em|ex|mu|px|pc|in|mm|cm|%)?/);
      var m = parseFloat(match[1]||"1"), unit = match[2];
      if (size == null) {size = 1}
      if (unit === "em") {return m}
      if (unit === "ex") {return m * this.TEX.x_height}
      if (unit === "%")  {return m / 100 * size}
      if (unit === "px") {return m / this.em}
      if (unit === "pt") {return m / 10}                      // 10 pt to an em
      if (unit === "pc") {return m * 1.2}                     // 12 pt to a pc
      if (unit === "in") {return m * this.pxPerInch / this.em}
      if (unit === "cm") {return m * this.pxPerInch / this.em / 2.54}  // 2.54 cm to an inch
      if (unit === "mm") {return m * this.pxPerInch / this.em / 25.4}  // 10 mm to a cm
      if (unit === "mu") {return m / 18}                     // 18mu to an em for the scriptlevel
      return m*size;  // relative to given size (or 1em as default)
    },

    Em: function (m) {
      if (Math.abs(m) < .001) return "0em";
      return (m.toFixed(3).replace(/\.?0+$/,""))+"em";
    },
    unEm: function (m) {
      return parseFloat(m);
    },
    
    Percent: function (m) {
      return (100*m).toFixed(1).replace(/\.?0+$/,"") + "%";
    },
    
    Transform: function (node,trans,origin) {
      var style = node.style;
      style.transform = style.WebkitTransform = style.MozTransform = trans;
      if (origin)
        style.transformOrigin = style.WebkitTransformOrigin = style.MozTransformOrigin = origin;
    },

    /********************************************************/
    
    arrayEntry: function (a,i) {return a[Math.max(0,Math.min(i,a.length-1))]},

    //
    //  Styles to be removed from style="..." attributes
    //
    removeStyles: ["fontSize","fontFamily","fontWeight","fontStyle","fontVariant","font"]
    
  });

  /**********************************************************/

  CHTML.BBOX = MathJax.Object.Subclass({
    Init: function (def) {
      for (var id in def) {
        if (def.hasOwnProperty(id)) this[id] = def[id];
      }
    },
    clean: function () {
      if (this.h === -BIGDIMEN) this.h = 0;
      if (this.d === -BIGDIMEN) this.d = 0;
      if (this.l ===  BIGDIMEN) this.l = 0;
      if (this.r === -BIGDIMEN) this.r = 0;
      if (this.t === -BIGDIMEN) this.t = 0;
      if (this.b === -BIGDIMEN) this.b = 0;
    },
    scale: function (level,dlevel) {
      var scale = Math.pow(SCRIPTFACTOR,Math.min(2,level)-(dlevel||0));
      this.w *= scale; this.h *= scale; this.d *= scale;
      this.l *= scale; this.r *= scale; this.t *= scale; this.b *= scale;
      if (this.L) this.L *= scale;
      if (this.R) this.R *= scale;
    },
    combine: function (cbox,x,y,scale) {
      if (x + scale*cbox.r > this.r) this.r = x + scale*cbox.r;
      if (x + scale*cbox.l < this.l) this.l = x + scale*cbox.l;
      if (x + scale*(cbox.w+(cbox.L||0)+(cbox.R||0)) > this.w)
        this.w  = x + scale*(cbox.w + (cbox.L||0) + (cbox.R||0));
      if (y + scale*cbox.h > this.h) this.h = y + scale*cbox.h;
      if (scale*cbox.d - y > this.d) this.d = scale*cbox.d - y;
      if (y + scale*cbox.t > this.t) this.t = y + scale*cbox.t;
      if (scale*cbox.b - y > this.b) this.b = scale*cbox.b - y;
    },
    adjust: function (m,x,X,M) {
      this[x] += CHTML.length2em(m);
      if (M == null) {
        if (this[x] > this[X]) this[X] = this[x];
      } else {
        if (this[X] < M) this[X] = M;
      }
    }
  },{
    zero: function () {return CHTML.BBOX({h:0, d:0, w:0, l:0, r:0, t:0, b:0})},
    empty: function () {
      return CHTML.BBOX({h:-BIGDIMEN, d:-BIGDIMEN, w:0, l:BIGDIMEN, r:-BIGDIMEN,
                         t:-BIGDIMEN, b:-BIGDIMEN});
    },
    //
    //  CSS styles that affect BBOXes
    //
    styleAdjust: [
      ["borderTopWidth","h","t"],
      ["borderRightWidth","w","r"],
      ["borderBottomWidth","d","b"],
      ["borderLeftWidth","w","l",0],
      ["paddingTop","h","t"],
      ["paddingRight","w","r"],
      ["paddingBottom","d","b"],
      ["paddingLeft","w","l",0],
    ]
  });
  
  /**********************************************************/

  MathJax.Hub.Register.StartupHook("mml Jax Ready",function () {
    MML = MathJax.ElementJax.mml;

    /********************************************************/
    
    MML.mbase.Augment({
      toCommonHTML: function (node,options) {
        return this.CHTMLdefaultNode(node,options);
      },

      CHTMLdefaultNode: function (node,options) {
        if (!options) options = {};
        node = this.CHTMLcreateNode(node);
        if (this.isToken) this.CHTMLgetVariant();
        var m = Math.max((options.minChildren||0),this.data.length);
        for (var i = 0; i < m; i++) this.CHTMLaddChild(node,i,options);
        if (!options.noBBox) {
          this.CHTML.clean();
          this.CHTMLhandleSpace(node);
        }
        this.CHTMLhandleStyle(node);
        this.CHTMLhandleColor(node);
        return node;
      },
      CHTMLaddChild: function (node,i,options) {
        var child = this.data[i];
        if (child) {
          var type = options.childNodes;
          if (type) {
            if (type instanceof Array) type = type[i];
            node = HTML.addElement(node,type);
          }
          child.toCommonHTML(node,options.childOptions);
          if (!options.noBBox) {
            var bbox = this.CHTML, cbox = child.CHTML;
            bbox.combine(cbox,bbox.w,0,1);
            if (cbox.ic) {bbox.ic = cbox.ic} else {delete bbox.ic}
            if (cbox.skew) bbox.skew = cbox.skew;
          }
        } else if (options.forceChild) {HTML.addElement(node,"span")}
      },
      CHTMLstretchChildV: function (i,H,D) {
        var data = this.data[i];
        if (data) {
          var bbox = this.CHTML;
          if (bbox.stretch || (bbox.stretch == null && data.CHTMLcanStretch("Vertical",H,D))) {
            var w = data.CHTML.w;
            data.CHTMLstretchV(H,D);
            var dbox = data.CHTML;
            bbox.w += dbox.w - w;
            if (dbox.h > bbox.h) bbox.h = dbox.h;
            if (dbox.d > bbox.d) bbox.d = dbox.d;
            if (dbox.t > bbox.t) bbox.t = dbox.t;
            if (dbox.b > bbox.b) bbox.b = dbox.b;
          }
        }
      },
      CHTMLstretchChildH: function (i,W,nodes) {
        var data = this.data[i];
        if (data) {
          var bbox = this.CHTML;
          if (bbox.stretch || (bbox.stretch == null && data.CHTMLcanStretch("Horizontal",W))) {
            data.CHTMLstretchH(nodes[i].firstChild,W);
            MathJax.Hub.Insert(this.CHTML,data.CHTML);
          }
        }
      },

      CHTMLcanStretch: function (direction,H,D) {
        var stretch = false;
        if (this.isEmbellished()) {
          var core = this.Core();
          if (core && core !== this) stretch = core.CHTMLcanStretch(direction,H,D);
        }
        this.CHTML.stretch = stretch;
        return stretch;
      },
      CHTMLstretchV: function (h,d) {},
      CHTMLstretchH: function (node,w) {},

      CHTMLcreateNode: function (node) {
        if (!this.CHTML) this.CHTML = {};
        this.CHTML = CHTML.BBOX.zero();
        if (this.inferred) return node;
        if (this.href) node = HTML.addElement(node,"a",{href:this.href, isMathJax:true});
        if (!this.CHTMLnodeID) {this.CHTMLnodeID = CHTML.GetID()};
        var id = (this.id || "MJXc-Node-"+this.CHTMLnodeID);
        return this.CHTMLhandleAttributes(HTML.addElement(node,"mjx-"+this.type,{id:id}));
      },
      CHTMLnodeElement: function () {
        if (!this.CHTMLnodeID) {return null}
        return document.getElementById(this.id||"MJXc-Node-"+this.CHTMLnodeID);
      },
      
      CHTMLhandleAttributes: function (node) {
        if (this["class"]) node.className = this["class"];
        //
        //  Copy RDFa, aria, and other tags from the MathML to the CHTML
        //  output nodes.  Don't copy those in the MML.nocopyAttributes list,
        //  the ignoreMMLattributes configuration list, or anything that
        //  already exists as a property of the node (e.g., no "onlick", etc.)
        //  If a name in the ignoreMMLattributes object is set to false, then
        //  the attribute WILL be copied.
        //
        if (this.attrNames) {
          var copy = this.attrNames, skip = MML.nocopyAttributes, ignore = HUB.config.ignoreMMLattributes;
          var defaults = (this.type === "mstyle" ? MML.math.prototype.defaults : this.defaults);
          for (var i = 0, m = copy.length; i < m; i++) {
            var id = copy[i];
            if (ignore[id] == false || (!skip[id] && !ignore[id] &&
                defaults[id] == null && typeof(node[id]) === "undefined")) {
              node.setAttribute(id,this.attr[id])
            }
          }
        }
        return node;
      },

      CHTMLhandleStyle: function (node) {
        if (!this.style) return;
        var BBOX = this.CHTML, style = node.style, i, m;
        style.cssText = this.style;
        // ### FIXME:  adjust for width, height, vertical-align?
        for (i = 0, m = CHTML.BBOX.styleAdjust.length; i < m; i++) {
          var data = CHTML.BBOX.styleAdjust[i];
          if (style[data[0]]) BBOX.adjust(style[data[0]],data[1],data[2],data[3]);
        }
        this.removedStyles = {};
        for (i = 0, m = CHTML.removeStyles.length; i < m; i++) {
          var id = CHTML.removeStyles[i];
          if (style[id]) {
            this.removedStyles[id] = style[id];
            style[id] = "";
          }
        }
      },

      CHTMLhandleColor: function (node) {
        if (this.mathcolor) {node.style.color = this.mathcolor}
          else if (this.color) {node.style.color = this.color}
        if (this.mathbackground) {node.style.backgroundColor = this.mathbackground}
          else if (this.background) {node.style.backgroundColor = this.background}
      },
      
      CHTMLhandleSpace: function (node) {
        if (!this.useMMLspacing) {
          var space = this.texSpacing();
          if (space !== "") {
            this.CHTML.L = CHTML.length2em(space);
            node.className += " "+CHTML.SPACECLASS[space];
          }
        }
      },

      CHTMLhandleScriptlevel: function (node,dlevel) {
        var level = this.Get("scriptlevel");
        if (level === 0) return;
        // ### FIXME: handle scriptminsize
        if (level > 2) level = 2;
        if (level > 0 && dlevel == null) {
          node.className += " MJXc-script";
        } else {
          if (dlevel) level -= dlevel;
          var scale = Math.floor(Math.pow(SCRIPTFACTOR,level)*100);
          node.style.fontSize = scale+"%";
        }
      },
      
      CHTMLhandleText: function (node,text,variant) {
        this.CHTML = CHTML.handleText(node,text,variant,this.CHTML);
      },
      
      CHTMLgetVariant: function () {
	var values = this.getValues("mathvariant","fontfamily","fontweight","fontstyle");
        values.hasVariant = this.Get("mathvariant",true);  // null if not explicitly specified
        if (this.style) {
          var span = HTML.Element("span"); span.style.cssText = this.style;
          if (span.style.fontFamily) values.family = span.style.fontFamily;
          if (span.style.fontWeight) values.weight = span.style.fontWeight;
          if (span.style.fontStyle)  values.style  = span.style.fontStyle;
        }
        if (!values.hasVariant) {
          if (values.fontfamily) values.family = values.fontfamily;
          if (values.fontweight) values.weight = values.fontweight;
          if (values.fontstyle)  values.style  = values.fontstyle;
        }
        if (values.weight && values.weight.match(/^\d+$/))
            values.weight = (parseInt(values.weight) > 600 ? "bold" : "normal");
	var variant = values.mathvariant; if (this.variantForm) variant = "-TeX-variant";
	if (values.family && !values.hasVariant) {
	  if (!values.weight && values.mathvariant.match(/bold/)) values.weight = "bold";
	  if (!values.style && values.mathvariant.match(/italic/)) values.style = "italic";
	  this.CHTMLvariant = {fonts:[], noRemap:true, cache:{}, style: {
            "font-family":values.family, "font-weight":values.weight, "font-style":values.style
          }};
          return;
	}
        if (values.weight === "bold") {
          variant = {
            normal:MML.VARIANT.BOLD, italic:MML.VARIANT.BOLDITALIC,
            fraktur:MML.VARIANT.BOLDFRAKTUR, script:MML.VARIANT.BOLDSCRIPT,
            "sans-serif":MML.VARIANT.BOLDSANSSERIF,
            "sans-serif-italic":MML.VARIANT.SANSSERIFBOLDITALIC
          }[variant]||variant;
        } else if (values.weight === "normal") {
          variant = {
            bold:MML.VARIANT.normal, "bold-italic":MML.VARIANT.ITALIC,
            "bold-fraktur":MML.VARIANT.FRAKTUR, "bold-script":MML.VARIANT.SCRIPT,
            "bold-sans-serif":MML.VARIANT.SANSSERIF,
            "sans-serif-bold-italic":MML.VARIANT.SANSSERIFITALIC
          }[variant]||variant;
        }
        if (values.style === "italic") {
          variant = {
            normal:MML.VARIANT.ITALIC, bold:MML.VARIANT.BOLDITALIC,
            "sans-serif":MML.VARIANT.SANSSERIFITALIC,
            "bold-sans-serif":MML.VARIANT.SANSSERIFBOLDITALIC
          }[variant]||variant;
        } else if (values.style === "normal") {
          variant = {
            italic:MML.VARIANT.NORMAL, "bold-italic":MML.VARIANT.BOLD,
            "sans-serif-italic":MML.VARIANT.SANSSERIF,
            "sans-serif-bold-italic":MML.VARIANT.BOLDSANSSERIF
          }[variant]||variant;
        }
        this.CHTMLvariant = CHTML.FONTDATA.VARIANT[variant] ||
                            CHTML.FONTDATA.VARIANT[MML.VARIANT.NORMAL];
      },

      CHTMLbboxFor: function (n) {
        if (this.data[n] && this.data[n].CHTML) return this.data[n].CHTML;
        return CHTML.BBOX.zero();
      },
      //
      //  Debugging function to see if internal BBox matches actual bbox
      //
      CHTMLdrawBBox: function (node) {
        var bbox = this.CHTML;
        HTML.addElement(node.parentNode,"mjx-box",
          {style:{opacity:.25,"margin-left":CHTML.Em(-bbox.w-(bbox.R||0))}},[
          ["mjx-box",{style:{
            height:CHTML.Em(bbox.h),width:CHTML.Em(bbox.w),"background-color":"red"}
          }],
          ["mjx-box",{style:{
            height:CHTML.Em(bbox.d),width:CHTML.Em(bbox.w),
            "margin-left":CHTML.Em(-bbox.w),"vertical-align":CHTML.Em(-bbox.d),
            "background-color":"green"}
          }]
        ]);
      },

      CHTMLnotEmpty: function (mml) {
        while (mml && mml.data.length < 2 && (mml.type === "mrow" || mml.type === "texatom"))
          mml = mml.data[0];
        return !!mml;
      }

    });

    /********************************************************/
    
    MML.chars.Augment({
      toCommonHTML: function (node,options) {
        if (options == null) options = {};
        var text = this.toString();
        if (options.remap) text = options.remap(text,options.remapchars);
        //  ### FIXME: handle mtextFontInherit
        this.CHTMLhandleText(node,text,options.variant||this.parent.CHTMLvariant);
      }
    });
    MML.entity.Augment({
      toCommonHTML: function (node,options) {
        if (options == null) options = {};
        var text = this.toString();
        if (options.remapchars) text = options.remap(text,options.remapchars);
        //  ### FIXME: handle mtextFontInherit
        this.CHTMLhandleText(node,text,options.variant||this.parent.CHTMLvariant);
      }
    });

    /********************************************************/
    
    MML.math.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node);
        if (this.Get("display") === "block") {node.className += " MJXc-display"}
        return node;
      }
    });
    
    /********************************************************/
    
    MML.mi.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node);
        var bbox = this.CHTML, text = this.data.join("");
        if (bbox.skew != null && text.length !== 1) delete bbox.skew;
        if (bbox.r > bbox.w && text.length === 1 /*&& !variant.noIC*/) {  // ### FIXME: handle variants
          bbox.ic = bbox.r - bbox.w; bbox.w = bbox.r;
          node.lastChild.style.paddingRight = CHTML.Em(bbox.ic);
        }
        return node;
      }
    });

    /********************************************************/
    
    MML.mo.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLcreateNode(node);
        this.CHTML = CHTML.BBOX.empty();
        
        var values = this.getValues("displaystyle","largeop","mathvariant");
        values.text = this.data.join("");
        if (values.text == "") {
          if (this.fence) node.style.width = CHTML.Em(CHTML.TEX.nulldelimiterspace);
        } else {
          this.CHTMLadjustAccent(values);
          this.CHTMLadjustVariant(values);

          for (var i = 0, m = this.data.length; i < m; i++) {
            this.CHTMLaddChild(node,i,{childOptions:{
              variant: values.mathvariant,
              remap: this.remap,
              remapchars: values.mapchars
            }});
          }
          if (values.text.length !== 1) delete this.CHTML.skew;
          if (values.largeop) this.CHTMLcenterOp(node);
        }

        this.CHTML.clean();
        this.CHTMLhandleSpace(node);
        this.CHTMLhandleStyle(node);
        this.CHTMLhandleColor(node);

        return node;
      },
      CHTMLhandleSpace: function (node) {
        if (this.useMMLspacing) {
          var values = this.getValues("scriptlevel","lspace","rspace");
          values.lspace = Math.max(0,CHTML.length2em(values.lspace));
          values.rspace = Math.max(0,CHTML.length2em(values.rspace));
          if (values.scriptlevel > 0) {
            if (!this.hasValue("lspace")) values.lspace = .15;
            if (!this.hasValue("rspace")) values.rspace = .15;
          }
          var core = this, parent = this.Parent();
          while (parent && parent.isEmbellished() && parent.Core() === core)
            {core = parent; parent = parent.Parent(); node = core.CHTMLnodeElement()}
          if (values.lspace) node.style.paddingLeft =  CHTML.Em(values.lspace);
          if (values.rspace) node.style.paddingRight = CHTML.Em(values.rspace);
          this.CHTML.L = values.lspace; this.CHTML.R = values.rspace;
        } else {
          this.SUPER(arguments).CHTMLhandleSpace.apply(this,arguments);
        }
      },
      CHTMLadjustAccent: function (data) {
        var parent = this.CoreParent(); data.parent = parent;
        if (data.text.length === 1 && parent && parent.isa(MML.munderover) && 
            this.CoreText(parent.data[parent.base]).length === 1) {
          var over = parent.data[parent.over], under = parent.data[parent.under];
          if (over && this === over.CoreMO() && parent.Get("accent")) {
            data.mapchars = CHTML.FONTDATA.REMAPACCENT
          } else if (under && this === under.CoreMO() && parent.Get("accentunder")) {
            data.mapchars = CHTML.FONTDATA.REMAPACCENTUNDER
          }
        }
      },
      CHTMLadjustVariant: function (data) {
        var parent = data.parent,
            isScript = (parent && parent.isa(MML.msubsup) && this !== parent.data[parent.base]);
        if (data.largeop) data.mathvariant = (data.displaystyle ? "-largeOp" : "-smallOp");
        if (isScript) {
          data.mapchars = this.remapChars;
          if (data.text.match(/['`"\u00B4\u2032-\u2037\u2057]/))
            data.mathvariant = "-TeX-variant";  // ### FIXME: handle other fonts
        }
      },
      CHTMLcenterOp: function (node) {
        var bbox = this.CHTML;
        var p = (bbox.h - bbox.d)/2 - CHTML.TEX.axis_height;
        if (Math.abs(p) > .001) node.style.verticalAlign = CHTML.Em(-p);
        bbox.h -= p; bbox.d += p;
        if (bbox.r > bbox.w) {
          bbox.ic = bbox.r - bbox.w; bbox.w = bbox.r;
          node.style.paddingRight = CHTML.Em(bbox.ic);
        }
      },
      CHTMLcanStretch: function (direction,H,D) {
        if (!this.Get("stretchy")) return false;
        var c = this.data.join(""); if (c.length !== 1) return false;
        var values = {text: c};
        this.CHTMLadjustAccent(values);
        if (values.remapchars) c = values.remapchars[c]||c;
        c = CHTML.FONTDATA.DELIMITERS[c.charCodeAt(0)];
        var stretch = (c && c.dir === direction.substr(0,1));
        if (stretch) {
          stretch = (this.CHTML.h !== H || this.CHTML.d !== D ||
            !!this.Get("minsize",true) || !!this.Get("maxsize",true));
          if (stretch) this.CHTML.stretch = true;
        }
        return stretch;
      },
      CHTMLstretchV: function (h,d) {
        var node = this.CHTMLnodeElement(), bbox = this.CHTML;
        var values = this.getValues("symmetric","maxsize","minsize");
        //
        //  Determine the height needed
        //
        var H, a = CHTML.TEX.axis_height;
        if (values.symmetric) {H = 2*Math.max(h-a,d+a)} else {H = h + d}
        values.maxsize = CHTML.length2em(values.maxsize,bbox.h+bbox.d);
        values.minsize = CHTML.length2em(values.minsize,bbox.h+bbox.d);
        H = Math.max(values.minsize,Math.min(values.maxsize,H));
        //
        //  If we are not already stretched to this height
        //
        if (H !== bbox.sH) {
          //
          //  Get a delimiter of the proper height and save the height
          //
          if (H != values.minsize)
            {H = [Math.max(H*CHTML.TEX.delimiterfactor/1000,H-CHTML.TEX.delimitershortfall),H]}
          while (node.firstChild) node.removeChild(node.firstChild);
          this.CHTML = bbox = CHTML.createDelimiter(node,this.data.join("").charCodeAt(0),H,1);
          bbox.sH = (H instanceof Array ? H[1] : H);
          //
          //  Reposition as needed
          //
          if (values.symmetric) {H = (bbox.h + bbox.d)/2 + a}
            else {H = (bbox.h + bbox.d) * h/(h + d)}
          H -= bbox.h;
          if (Math.abs(H) > .05) {
            node.style.verticalAlign = CHTML.Em(H);
            bbox.h += H; bbox.d -= H; bbox.t += H; bbox.b -= H;
          }
        }
      },
      CHTMLstretchH: function (node,W) {
        var bbox = this.CHTML;
        var values = this.getValues("maxsize","minsize","mathvariant","fontweight");
        // FIXME:  should take style="font-weight:bold" into account as well
        if ((values.fontweight === "bold" || parseInt(values.fontweight) >= 600) &&
            !this.Get("mathvariant",true)) values.mathvariant = MML.VARIANT.BOLD;
        values.maxsize = CHTML.length2em(values.maxsize,bbox.w);
        values.minsize = CHTML.length2em(values.minsize,bbox.w);
        W = Math.max(values.minsize,Math.min(values.maxsize,W));
        if (W !== bbox.sW) {
          while (node.firstChild) node.removeChild(node.firstChild);
          this.CHTML = bbox = CHTML.createDelimiter(node,this.data.join("").charCodeAt(0),W,1,values.mathvariant);
          bbox.sW = W;
        }
      }

    });

    /********************************************************/
    
    MML.mspace.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLcreateNode(node);
        var values = this.getValues("height","depth","width");
        var w = CHTML.length2em(values.width),
            h = CHTML.length2em(values.height),
            d = CHTML.length2em(values.depth);
        var bbox = this.CHTML;
        bbox.w = bbox.r = w; bbox.h = bbox.t = h; bbox.d = bbox.b = d; bbox.l = 0;
        if (w < 0) {node.style.marginRight = CHTML.Em(w); w = 0}
        node.style.width = CHTML.Em(w);
        node.style.height = CHTML.Em(h+d);
        if (d) node.style.verticalAlign = CHTML.Em(-d);
        this.CHTMLhandleStyle(node);
        this.CHTMLhandleColor(node);
        return node;
      },
      CHTMLgetVariant: function () {}
    });

    /********************************************************/
    
    MML.mpadded.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node,{childNodes:"mjx-box", forceChild:true});
        var child = node.firstChild, cbox = this.CHTMLbboxFor(0);
        node = HTML.addElement(node,"mjx-block"); node.appendChild(child);
        HTML.addElement(node,"mjx-strut"); // force proper alignment of short heights
        var values = this.getValues("width","height","depth","lspace","voffset");
        var dimen, x = 0, y = 0, w = cbox.w, h = cbox.h, d = cbox.d;
        child.style.width = 0; child.style.margin = CHTML.Em(-h)+" 0 "+CHTML.Em(-d);
        if (values.width !== "")  w = this.CHTMLdimen(values.width,"w",w,0);
        if (values.height !== "") h = this.CHTMLdimen(values.height,"h",h,0);
        if (values.depth !== "")  d = this.CHTMLdimen(values.depth,"d",d,0);
        if (values.voffset !== "") {
          y = this.CHTMLdimen(values.voffset);
          if (y) {
            child.style.position = "relative";
            child.style.top = CHTML.Em(-y);
          }
        }
        if (values.lspace !== "") {
          x = this.CHTMLdimen(values.lspace);
          if (x) {
            child.style.position = "relative";
            child.style.left = CHTML.Em(x);
          }
        }
        node.style.width = 0;
        node.style.marginTop = CHTML.Em(h-STRUTHEIGHT);
        node.style.padding = "0 "+CHTML.Em(w)+" "+CHTML.Em(d)+" 0";
        var bbox = {w:w, h:h, d:d, l:0, r:w, t:h, b:d};
        bbox.combine(cbox,x,y,1);
        bbox.w = w; bbox.h = h; bbox.d = d;
        this.CHTML = bbox;
        return node.parentNode;
      },
      CHTMLdimen: function (length,d,D,m) {
        if (m == null) {m = -BIGDIMEN}
        length = String(length);
        var match = length.match(/width|height|depth/);
        var size = (match ? this.CHTML[match[0].charAt(0)] : (d ? this.CHTML[d] : 0));
        var dimen = (CHTML.length2em(length,size)||0);
        if (length.match(/^[-+]/)) dimen += D;
        if (m != null) dimen = Math.max(m,dimen);
        return dimen;
      }
    });

    /********************************************************/
    
    MML.munderover.Augment({
      toCommonHTML: function (node) {
        var values = this.getValues("displaystyle","scriptlevel","accent","accentunder","align");
        if (!values.displaystyle && this.data[this.base] != null &&
            this.data[this.base].CoreMO().Get("movablelimits"))
                return MML.msubsup.prototype.toCommonHTML.call(this,node);
        //
        //  Get the nodes for base and limits
        //
        var types = ["mjx-op","mjx-under","mjx-over"];
        if (this.over === 1) types[1] = types[2];
        node = this.CHTMLdefaultNode(node,{
          childNodes:types, noBBox:true, forceChild:true, minChildren: 2
        });
        var base, under, over, nodes = [];
        nodes[0] = base = node.removeChild(node.firstChild);
        nodes[1] = under = over = node.removeChild(node.firstChild);
        if (node.firstChild) nodes[2] = over = node.removeChild(node.firstChild);
        //
        //  Get the scale of the base and its limits
        //
        this.CHTMLgetScaleFactors(values,under,over);
        //
        //  Get the bounding boxes and the maximum width
        //
        var boxes = [], W = this.CHTMLgetBBoxes(boxes,nodes,values);
        var bbox = boxes[this.base], BBOX = this.CHTML;
        BBOX.w = W; BBOX.h = bbox.h; BBOX.d = bbox.d; // modified below
        //
        //  Add over- and under-scripts
        //  
        var stack = base, delta = 0;
        if (bbox.ic) {delta = 1.3*bbox.ic + .05} // make faked IC be closer to expeted results
        if (this.data[this.over]) stack = this.CHTMLaddOverscript(over,boxes,values,delta,base);
        if (this.data[this.under]) this.CHTMLaddUnderscript(under,boxes,values,delta,node,stack);
          else node.appendChild(stack);
        //
        //  Handle horizontal positions
        //
        this.CHTMLplaceBoxes(base,under,over,values,boxes);
        this.CHTMLhandleSpace(node);
        return node;
      },
      //
      //  Compute scaling factors for the under- and over-scripts
      //
      CHTMLgetScaleFactors: function (values,under,over) {
        values.oscale = values.uscale = 1;
        if (values.scriptlevel < 2) {
          if (!values.accent) {
            values.oscale = SCRIPTFACTOR;
            if (this.data[this.over])  this.data[this.over].CHTMLhandleScriptlevel(over);
          }
          if (!values.accentunder) {
            values.uscale = SCRIPTFACTOR;
            if (this.data[this.under]) this.data[this.under].CHTMLhandleScriptlevel(under);
          }
        }
      },
      //
      //  Get the bounding boxes for the children, stretch
      //  any stretchable elements, and compute the maximum width
      //  
      CHTMLgetBBoxes: function (bbox,nodes,values) {
        var i, m = this.data.length, SCALE,
            w = -BIGDIMEN,  // maximum width of non-stretchy items
            W = w;          // maximum width of all items
        //
        //  Get the maximum width
        //
        for (i = 0; i < m; i++) {
          bbox[i] = this.CHTMLbboxFor(i); bbox[i].x = bbox[i].y = 0;
          if (this.data[i]) bbox[i].stretch = this.data[i].CHTMLcanStretch("Horizontal");
          SCALE = (i === this.base ? 1 : i === this.over ? values.oscale : values.uscale);
          W = Math.max(W,SCALE*(bbox[i].w + (bbox[i].L||0) + (bbox[i].R||0)));
          if (!bbox[i].stretch && W > w) w = W;
        }
        if (w === -BIGDIMEN) w = W;
        //
        //  Stretch those parts that need it
        //
        for (i = 0; i < m; i++) {
          if (bbox[i].stretch) {
            SCALE = (i === this.base ? 1 : i === this.over ? values.oscale : values.uscale);
            this.CHTMLstretchChildH(i,w/SCALE,nodes);
            bbox[i] = this.CHTMLbboxFor(i); bbox[i].x = bbox[i].y = 0;
            W = Math.max(W,SCALE*(bbox[i].w + (bbox[i].L||0) + (bbox[i].R||0)));
          }
        }
        return W;
      },
      //
      //  Add an overscript
      //
      CHTMLaddOverscript: function (over,boxes,values,delta,base) {
        var BBOX = this.CHTML;
        var w, z1, z2, z3 = CHTML.TEX.big_op_spacing5, k;
        var scale = values.oscale, obox = boxes[this.over], bbox = boxes[this.base];
        //
        //  Put the base and script into a stack
        //  
        var stack = HTML.Element("mjx-stack");
        stack.appendChild(over); stack.appendChild(base);
        if (obox.d < 0) {
          //
          // For negative depths, set the height and align to top
          // in order to avoid extra baseline space
          //
          over.firstChild.style.verticalAlign = "top";
          over.style.height = CHTML.Em(obox.h+obox.d);
        }
        //
        //  Determine the spacing
        //
        obox.x = 0;
        if (values.accent) {
          if (obox.w < .001) obox.x += (obox.r - obox.l)/2; // center combining accents
          k = CHTML.TEX.rule_thickness; z3 = 0;
          if (bbox.skew) {
            obox.x += scale*bbox.skew; BBOX.skew = scale*bbox.skew;
            if (obox.x+scale*obox.w > BBOX.w) BBOX.skew += (BBOX.w - (obox.x+scale*obox.w))/2;
          }
        } else {
          z1 = CHTML.TEX.big_op_spacing1;
          z2 = CHTML.TEX.big_op_spacing3;
          k = Math.max(z1,z2-Math.max(0,scale*obox.d));
        }
        obox.x += delta/2; obox.y = BBOX.h + k + z3 + scale*obox.d;
        //
        //  Position the overscript
        //
        if (k) over.style.paddingBottom = CHTML.Em(k/scale);
        if (z3) over.style.paddingTop = CHTML.Em(z3/scale);
        return stack;
      },
      //
      //  Add an underscript
      //
      CHTMLaddUnderscript: function (under,boxes,values,delta,node,stack) {
        var BBOX = this.CHTML;
        var w, x = 0, z1, z2, z3 = CHTML.TEX.big_op_spacing5, k;
        var scale = values.uscale, ubox = boxes[this.under], bbox = boxes[this.base];
        //
        //  Create a table for the underscript
        //
        HTML.addElement(node,"mjx-itable",{},[
          ["mjx-row",{},[["mjx-cell"]]],
          ["mjx-row"],
        ]);
        node.firstChild.firstChild.firstChild.appendChild(stack);
        node.firstChild.lastChild.appendChild(under);
        if (ubox.d < 0) {
          //
          // For negative depths, set the height and align to top
          // in order to avoid extra baseline space
          //
          under.firstChild.style.verticalAlign = "top";
          under.style.height = CHTML.Em(ubox.h+ubox.d);
        }
        //
        //  determine the spacing
        //
        if (values.accentunder) {
          k = 3*CHTML.TEX.rule_thickness; z3 = 0;
        } else {
          z1 = CHTML.TEX.big_op_spacing2;
          z2 = CHTML.TEX.big_op_spacing4;
          k = Math.max(z1,z2-scale*ubox.h);
        }
        ubox.x = -delta/2; ubox.y = -(BBOX.d + k + z3 + scale*ubox.h);
        //
        //  Position the overscript
        //
        if (k) under.style.paddingTop = CHTML.Em(k/scale);
        if (z3) under.style.paddingBottom = CHTML.Em(z3/scale);
      },
      //
      //  Center boxes horizontally, taking offsets into account
      //
      CHTMLplaceBoxes: function (base,under,over,values,boxes) {
        var W = this.CHTML.w, i, m = boxes.length;
        var BBOX = this.CHTML = CHTML.BBOX.zero();
        boxes[this.base].x = boxes[this.base].y = 0; var dx = BIGDIMEN;
        for (i = 0; i < m; i++) {
          var SCALE = (i === this.base ? 1 : i === this.over ? values.oscale : values.uscale);
          var w = SCALE*(boxes[i].w + (boxes[i].L||0) + (boxes[i].R||0));
          boxes[i].x += (W-w)/2;
          if (boxes[i].x < dx) dx = boxes[i].x;
        }
        for (i = 0; i < m; i++) {
          if (this.data[i]) {
            var SCALE = (i === this.base ? 1 : i === this.over ? values.oscale : values.uscale);
            if (boxes[i].x - dx) {
              var node = (i === this.base ? base : i === this.over ? over : under);
              node.style.paddingLeft = CHTML.Em((boxes[i].x-dx)/SCALE);
            }
            BBOX.combine(boxes[i],boxes[i].x-dx,boxes[i].y,SCALE);
          }
        }
      }
    });

    /********************************************************/
    
    MML.msubsup.Augment({
      toCommonHTML: function (node) {
        var values = this.getValues("displaystyle","scriptlevel",
                       "subscriptshift","superscriptshift","texprimestyle");
        //
        //  Get the nodes for base and limits
        //
        var types = ["mjx-base","mjx-sub","mjx-sup"];
        if (this.sup === 1) types[1] = types[2];
        node = this.CHTMLdefaultNode(node,{
          childNodes:types, noBBox:true, forceChild:true, minChildren: 3
        });
        var base, sub, sup; base = node.childNodes[this.base];
        sub = node.childNodes[this.sub]; sup = node.childNodes[this.sup];
        if (!this.CHTMLnotEmpty(this.data[this.sub])) {node.removeChild(sub); sub = null}
        if (!this.CHTMLnotEmpty(this.data[this.sup])) {node.removeChild(sup); sup = null}
        if (node.childNodes.length === 3) {
          var stack = HTML.addElement(node,"mjx-stack");
          stack.appendChild(sup); stack.appendChild(sub);
        }
        //
        //  Get the scale of the base and its scripts
        //
        var sscale = 1;
        if (values.scriptlevel < 2) {
          sscale = SCRIPTFACTOR;
          if (sub) this.data[this.sub].CHTMLhandleScriptlevel(sub);
          if (sup) this.data[this.sup].CHTMLhandleScriptlevel(sup);
        }
        //
        //  Get the bounding boxes and maximum width of scripts
        //
        var boxes = [], BBOX = this.CHTML = CHTML.BBOX.empty(); 
        for (var i = 0, m = this.data.length; i < m; i++) boxes[i] = this.CHTMLbboxFor(i);
        var bbox = boxes[this.base], subbox = boxes[this.sub], supbox = boxes[this.sup];
        BBOX.combine(bbox,0,0,1);
        //
        //  Get initial values for parameters
        //
        var ex = CHTML.TEX.x_height, s = CHTML.TEX.scriptspace;
        var q = CHTML.TEX.sup_drop * sscale, r = CHTML.TEX.sub_drop * sscale;
        var u = bbox.h - q, v = bbox.d + r, delta = 0, p;
        if (bbox.ic) {
          BBOX.w -= bbox.ic;         // remove IC (added by mo and mi)
          base.style.marginRight = CHTML.Em(-bbox.ic);
          delta = 1.3*bbox.ic + .05; // make faked IC be closer to expeted results
        }
        var bmml = this.data[this.base];
        if (bmml && (bmml.type === "mi" || bmml.type === "mo")) {
          if (bmml.data.join("").length === 1 && bmml.Get("scriptlevel") === 0 &&
              !bmml.Get("largeop")) {u = v = 0}  // ### FIXME: get scale rather than use scriptlevel
        }
        values.subscriptshift   = (values.subscriptshift === ""   ? 0 : CHTML.length2em(values.subscriptshift));
        values.superscriptshift = (values.superscriptshift === "" ? 0 : CHTML.length2em(values.superscriptshift));
        //
        //  Add the super- and subscripts
        //
        var x = BBOX.w; if (sub) subbox.w += s; if (sup) supbox.w += s;
        if (!sup) {
          if (sub) {
            v = Math.max(v,CHTML.TEX.sub1,sscale*subbox.h-(4/5)*ex,values.subscriptshift);
            sub.style.verticalAlign = CHTML.Em(-v/sscale);
            sub.style.paddingRight = CHTML.Em(s/sscale);
            BBOX.combine(subbox,x,-v,sscale);
          }
        } else {
          if (!sub) {
            p = CHTML.TEX[(values.displaystyle ? "sup1" : (values.texprimestyle ? "sup3" : "sup2"))];
            u = Math.max(u,p,sscale*supbox.d+(1/4)*ex,values.superscriptshift);
            sup.style.verticalAlign = CHTML.Em(u/sscale);
            sup.style.paddingLeft = CHTML.Em(delta/sscale);
            sup.style.paddingRight = CHTML.Em(s/sscale);
            BBOX.combine(supbox,x+delta,u,sscale);
          } else {
            v = Math.max(v,CHTML.TEX.sub2);
            var t = CHTML.TEX.rule_thickness;
            if ((u - sscale*supbox.d) - (sscale*subbox.h - v) < 3*t) {
              v = 3*t - u + sscale*(supbox.d + subbox.h);
              q = (4/5)*ex - (u - sscale*supbox.d);
              if (q > 0) {u += q; v -= q}
            }
            u = Math.max(u,values.superscriptshift);
            v = Math.max(v,values.subscriptshift);
            sub.style.paddingRight = CHTML.Em(s/sscale);
            sup.style.paddingBottom = CHTML.Em((u+v)/sscale-supbox.d-subbox.h);
            sup.style.paddingLeft = CHTML.Em(delta/sscale);
            sup.style.paddingRight = CHTML.Em(s/sscale);
            stack.style.verticalAlign = CHTML.Em(-v);
            BBOX.combine(supbox,x+delta,u,sscale);
            BBOX.combine(subbox,x,-v,sscale);
          }
        }
        BBOX.clean();
        this.CHTMLhandleSpace(node);
        return node;
      }
    });

    /********************************************************/
    
    MML.mfrac.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node,{
          childNodes:["mjx-numerator","mjx-denominator"],
          forceChild:true, noBBox:true, minChildren:2
        });
        var values = this.getValues("linethickness","displaystyle","scriptlevel",
                                    "numalign","denomalign","bevelled");
        var isDisplay = values.displaystyle;
        //
        //  Get the scale of the fraction and its parts
        //
        var sscale = 1, scale = (values.scriptlevel > 0 ? SCRIPTFACTOR : 1);
        if (!isDisplay && values.scriptlevel < 2) {
          sscale = SCRIPTFACTOR;
          if (this.data[0]) this.data[0].CHTMLhandleScriptlevel(node.firstChild);
          if (this.data[1]) this.data[1].CHTMLhandleScriptlevel(node.lastChild);
        }
        //
        //  Create the table for the fraction and set the alignment
        //
        var num = node.firstChild, denom = node.lastChild;
        var frac = HTML.addElement(node,"mjx-box");
        frac.appendChild(num); frac.appendChild(denom); node.appendChild(frac);
        if (values.numalign !== "center") num.style.textAlign = values.numalign;
        if (values.denomalign !== "center") denom.style.textAlign = values.denomalign;
        //
        //  Get the bounding boxes for the parts, and determine the placement
        //  of the numerator and denominator
        //
        var nbox = this.CHTMLbboxFor(0), dbox = this.CHTMLbboxFor(1), BBOX;
        values.linethickness = Math.max(0,CHTML.length2em(values.linethickness||"0",0));
        var mt = CHTML.TEX.min_rule_thickness/CHTML.em/scale, a = CHTML.TEX.axis_height;
        var t = values.linethickness, p,q, u,v;
        if (values.bevelled) {
          frac.className = "MJXc-bevelled";
	  var delta = (isDisplay ? .4 : .15);
	  var H = sscale*Math.max(nbox.h+nbox.d,dbox.h+dbox.d) + 2*delta;
	  var bevel = HTML.Element("mjx-bevel"); frac.insertBefore(bevel,denom);
          var bbox = CHTML.createDelimiter(bevel,0x2F,H);
          u = sscale*(nbox.d-nbox.h)/2+a+delta;
          v = sscale*(dbox.d-dbox.h)/2+a-delta;
          if (u) num.style.verticalAlign = CHTML.Em(u);
          if (v) denom.style.verticalAlign = CHTML.Em(v);
          bevel.style.marginLeft = bevel.style.marginRight = CHTML.Em(-delta/2);
          BBOX = this.CHTML = CHTML.BBOX.empty();
          BBOX.combine(nbox,0,u,sscale);
          BBOX.combine(bbox,sscale*nbox.w-delta/2,0,sscale);
          BBOX.combine(dbox,sscale*nbox.w+bbox.w-delta,v,sscale);
          BBOX.clean();
        } else {
          if (isDisplay) {u = CHTML.TEX.num1; v = CHTML.TEX.denom1}
            else {u = (t === 0 ? CHTML.TEX.num3 : CHTML.TEX.num2); v = CHTML.TEX.denom2}
          if (t === 0) { // \atop
            p = Math.max((isDisplay ? 7 : 3) * CHTML.TEX.rule_thickness, 2*mt); // force to at least 2 px
            q = (u - nbox.d*sscale) - (dbox.h*sscale - v);
            if (q < p) {u += (p - q)/2; v += (p - q)/2}
            frac.style.verticalAlign = CHTML.Em(-v);
          } else { // \over
            p = Math.max((isDisplay ? 3 : 0) * t, mt);  // force to be at least 1px
            t = Math.max(t,mt);
            q = (u - nbox.d*sscale) - (a + t/2); if (q < p) u += (p - q);
            q = (a - t/2) - (dbox.h*sscale - v); if (q < p) v += (p - q);
            frac.style.verticalAlign = CHTML.Em(t/2-v);
            num.style.borderBottom = CHTML.Em(t)+" solid";
            num.className += " MJXc-fpad";   nbox.L = nbox.R = .1;
            denom.className += " MJXc-fpad"; dbox.L = dbox.R = .1;
          }
          //
          //  Determine the new bounding box and place the parts
          //
          BBOX = this.CHTML = CHTML.BBOX.empty();
          BBOX.combine(nbox,0,u,sscale);
          BBOX.combine(dbox,0,-v,sscale);
          BBOX.clean();
          u -= sscale*nbox.d + a + t/2; v -= sscale*dbox.h - a + t/2;
          if (u > 0) num.style.paddingBottom = CHTML.Em(u);
          if (v > 0) denom.style.paddingTop = CHTML.Em(v);
        }
        //
        //  Add nulldelimiterspace around the fraction
        //  (TeXBook pg 150 and Appendix G rule 15e)
        //
        if (!this.texWithDelims && !this.useMMLspacing) {
          var space = CHTML.TEX.nulldelimiterspace;
          frac.style.padding = "0 "+CHTML.Em(space);
          BBOX.l += space; BBOX.r += space; BBOX.w += 2*space;
        }
        this.CHTMLhandleSpace(node);
        //
        //  Return the completed fraction
        //
        return node;
      }
    });

    /********************************************************/
    
    MML.msqrt.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node,{
          childNodes:["mjx-box","mjx-root"], forceChild:true, noBBox:true
        });
        var base = node.firstChild;
        var sqrt = HTML.addElement(node,"mjx-box"); sqrt.appendChild(base);
        var bbox = this.CHTMLbboxFor(0), BBOX = this.CHTML = CHTML.BBOX.empty();
        var t = CHTML.TEX.rule_thickness, T = CHTML.TEX.surd_height, p = t, q, H;
        if (this.Get("displaystyle")) p = CHTML.TEX.x_height;
        q = t + p/4;
        H = bbox.h + bbox.d + q + t;
        var surd = HTML.Element("mjx-surd"); sqrt.insertBefore(surd,base);
        var sbox = CHTML.createDelimiter(surd,0x221A,[H-.04,H],1);
        if (sbox.h + sbox.d > H) q = ((sbox.h+sbox.d) - (H-t))/2;
        H = bbox.h + q + t;
        var x = this.CHTMLaddRoot(node,sbox,sbox.h+sbox.d-H);
        base.style.paddingTop = CHTML.Em(q); 
        base.style.borderTop = CHTML.Em(T)+" solid";
        sqrt.style.paddingTop = CHTML.Em(2*t-T);  // use wider line, but don't affect height
        bbox.h += q + 2*t;
        BBOX.combine(sbox,x,H-sbox.h,1);
        BBOX.combine(bbox,x+sbox.w,0,1);
        BBOX.clean();
        this.CHTMLhandleSpace(node);
        return node;
      },
      CHTMLaddRoot: function () {return 0}
    });

    /********************************************************/
    
    MML.mroot.Augment({
      toCommonHTML: MML.msqrt.prototype.toCommonHTML,
      CHTMLaddRoot: function (sqrt,sbox,d) {
        if (!this.data[1]) return;
        var BBOX = this.CHTML, bbox = this.data[1].CHTML,
            root = sqrt.firstChild;
        var dlevel = Math.min(2,this.Get("scriptlevel")),
             level = Math.min(2,this.data[1].Get("scriptlevel"));
        scale = Math.pow(SCRIPTFACTOR,level-dlevel);
        if (scale !== 1) this.data[1].CHTMLhandleScriptlevel(root,dlevel);
        var h = this.CHTMLrootHeight(bbox,sbox,scale)-d;
        var w = Math.min(bbox.w,bbox.r); // remove extra right-hand padding, if any
        var dx = Math.max(w,sbox.offset/scale); 
        if (h) root.style.verticalAlign = CHTML.Em(h/scale);
        if (dx > w) root.firstChild.style.paddingLeft = CHTML.Em(dx-w);
        dx -= sbox.offset/scale;
        root.style.width = CHTML.Em(dx);
        BBOX.combine(bbox,0,h,scale);
        return dx*scale;
      },
      CHTMLrootHeight: function (bbox,sbox,scale) {
        return .45*(sbox.h+sbox.d-.9)+sbox.offset + Math.max(0,bbox.d-.075);
      }
    });
    
    /********************************************************/
    
    MML.mfenced.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLcreateNode(node);
        //
        //  Make row of open, data, sep, ... data, close
        //
        this.CHTMLaddChild(node,"open",{});
        for (var i = 0, m = this.data.length; i < m; i++) {
          this.CHTMLaddChild(node,"sep"+i,{});
          this.CHTMLaddChild(node,i,{});
        }
        this.CHTMLaddChild(node,"close",{});
        //
        //  Check for stretching the elements
        //
        var H = this.CHTML.h, D = this.CHTML.d;
        this.CHTMLstretchChildV("open",H,D);
        for (i = 0, m = this.data.length; i < m; i++) {
          this.CHTMLstretchChildV("sep"+i,H,D);
          this.CHTMLstretchChildV(i,H,D);
        }
        this.CHTMLstretchChildV("close",H,D);
        this.CHTMLhandleSpace(node);
        this.CHTMLhandleStyle(node);
        this.CHTMLhandleColor(node);
        return node;
      }
    });

    /********************************************************/
    
    MML.mrow.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node);
        var bbox = this.CHTML, H = bbox.h, D = bbox.d;
        for (var i = 0, m = this.data.length; i < m; i++) this.CHTMLstretchChildV(i,H,D);
        return node;
      }
    });

    /********************************************************/
    
    MML.mstyle.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node);
        if (this.scriptlevel) {
          var dlevel = this.Get("scriptlevel",null,true);
          if (this.scriptlevel !== dlevel) {
            this.CHTMLhandleScriptlevel(node,dlevel);
            this.CHTML.scale(this.scriptlevel,dlevel);
          }
        }
        return node;
      }
    });

    /********************************************************/
    
    MML.TeXAtom.Augment({
      toCommonHTML: function (node) {
        // ### FIXME: handle TeX class?
        node = this.CHTMLdefaultNode(node);
        var H = this.CHTML.h, D = this.CHTML.d;
        for (var i = 0, m = this.data.length; i < m; i++) this.CHTMLstretchChildV(i,H,D);
        return node;
      }
    });

    /********************************************************/
    
    MML.mtable.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLdefaultNode(node,{noBBox:true});
        var values = this.getValues("columnalign","rowalign","columnspacing","rowspacing",
                                    "columnwidth","equalcolumns","equalrows",
                                    "columnlines","rowlines","frame","framespacing",
                                    "align","width"/*,"useHeight","side","minlabelspacing"*/);
        var SPLIT = MathJax.Hub.SplitList, i, m, j, n;
        var CSPACE = SPLIT(values.columnspacing),
            RSPACE = SPLIT(values.rowspacing),
            CALIGN = SPLIT(values.columnalign),
            RALIGN = SPLIT(values.rowalign);//,
//            CLINES = SPLIT(values.columnlines),
//            RLINES = SPLIT(values.rowlines),
//            CWIDTH = SPLIT(values.columnwidth),
//            RCALIGN = [];
        for (i = 0, m = CSPACE.length; i < m; i++) {CSPACE[i] = CHTML.length2em(CSPACE[i])}
        for (i = 0, m = RSPACE.length; i < m; i++) {RSPACE[i] = CHTML.length2em(RSPACE[i])}

        var table = HTML.Element("span");
        while (node.firstChild) table.appendChild(node.firstChild);
        node.appendChild(table);
        var H = 0, W = 0;
        for (i = 0, m = this.data.length; i < m; i++) {
          var row = this.data[i];
          if (row) {
            var rspace = CHTML.arrayEntry(RSPACE,i-1), ralign = CHTML.arrayEntry(RALIGN,i);
            var rbox = row.CHTML, rnode = row.CHTMLnodeElement();
            rnode.style.verticalAlign = ralign;
            var k = (row.type === "mlabeledtr" ? 1 : 0);
            for (j = 0, n = row.data.length; j < n-k; j++) {
              var cell = row.data[j+k];
              if (cell) {
                var cspace = CHTML.arrayEntry(CSPACE,j-1), calign = CHTML.arrayEntry(CALIGN,j);
                var /*cbox = cell.CHTML,*/ cnode = cell.CHTMLnodeElement();
                if (j) {rbox.w += cspace; cnode.style.paddingLeft = CHTML.Em(cspace)}
                if (i) cnode.style.paddingTop = CHTML.Em(rspace);
                cnode.style.textAlign = calign;
              }
            }
            H += rbox.h + rbox.d; if (i) {H += rspace}
            if (rbox.w > W) W = rbox.w;
          }
        }
        var bbox = this.CHTML;
        bbox.w = W; bbox.h = H/2 + AXISHEIGHT; bbox.d = H/2 - AXISHEIGHT;
        bbox.L = bbox.R = .125;
        return node;
      }
    });
    MML.mlabeledtr.Augment({
      CHTMLdefaultNode: function (node,options) {
        if (!options) options = {};
        node = this.CHTMLcreateNode(node);
        // skip label for now
        for (var i = 1, m = this.data.length; i < m; i++) this.CHTMLaddChild(node,i,options);
        this.CHTMLhandleStyle(node);
        this.CHTMLhandleColor(node);
        return node;
      }
    });

    /********************************************************/
    
    MML.semantics.Augment({
      toCommonHTML: function (node) {
        node = this.CHTMLcreateNode(node);
        if (this.data[0]) {
          this.data[0].toCommonHTML(node);
          MathJax.Hub.Insert(this.data[0].CHTML||{},this.CHTML);
        }
        return node;
      }
    });
    MML.annotation.Augment({toCommonHTML: function(node) {}});
    MML["annotation-xml"].Augment({toCommonHTML: function(node) {}});

    /********************************************************/
    
    //
    //  Loading isn't complete until the element jax is modified,
    //  but can't call loadComplete within the callback for "mml Jax Ready"
    //  (it would call CommonHTML's Require routine, asking for the mml jax again)
    //  so wait until after the mml jax has finished processing.
    //  
    //  We also need to wait for the onload handler to run, since the loadComplete
    //  will call Config and Startup, which need to modify the body.
    //
    MathJax.Hub.Register.StartupHook("onLoad",function () {
      setTimeout(MathJax.Callback(["loadComplete",CHTML,"jax.js"]),0);
    });
  });

  MathJax.Hub.Register.StartupHook("End Cookie", function () {  
    if (HUB.config.menuSettings.zoom !== "None")
      {AJAX.Require("[MathJax]/extensions/MathZoom.js")}
  });
    
})(MathJax.Ajax,MathJax.Hub,MathJax.HTML,MathJax.OutputJax.CommonHTML);
