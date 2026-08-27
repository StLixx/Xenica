import{LD as K,LE as F,LF as M,LG as R,LB as U,LH as H,KJ as g,KD as S,KI as C,L0 as W,KT as X,KU as B,KV as L,Bb as E,KX as G,KQ as z,KW as j}from"./accountApi-CYLWAIWm.js";import{G as J}from"./graph-BmQWlsQW.js";import{r as Q}from"./index-5325376f-D91P2C2g.js";import{c as Y}from"./channel-DpHvy_1N.js";(function(){try{var e=typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{},l=new Error().stack;l&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[l]="9e51682c-876a-425a-ad6e-ccfa0b45d055",e._sentryDebugIdIdentifier="sentry-dbid-9e51682c-876a-425a-ad6e-ccfa0b45d055")}catch{}})();function Z(e){return typeof e=="string"?new K([document.querySelectorAll(e)],[document.documentElement]):new K([M(e)],F)}function be(e,l){return!!e.children(l).length}function pe(e){return I(e.v)+":"+I(e.w)+":"+I(e.name)}var O=/:/g;function I(e){return e?String(e).replace(O,"\\:"):""}function ee(e,l){l&&e.attr("style",l)}function fe(e,l,c){l&&e.attr("class",l).attr("class",c+" "+e.attr("class"))}function ue(e,l){var c=l.graph();if(R(c)){var a=c.transition;if(U(a))return a(e)}return e}function te(e,l){var c=e.append("foreignObject").attr("width","100000"),a=c.append("xhtml:div");a.attr("xmlns","http://www.w3.org/1999/xhtml");var i=l.label;switch(typeof i){case"function":a.insert(i);break;case"object":a.insert(function(){return i});break;default:a.html(i)}ee(a,l.labelStyle),a.style("display","inline-block"),a.style("white-space","nowrap");var d=a.node().getBoundingClientRect();return c.attr("width",d.width).attr("height",d.height),c}const V={},re=function(e){const l=Object.keys(e);for(const c of l)V[c]=e[c]},P=async function(e,l,c,a,i,d){const u=a.select(`[id="${c}"]`),n=Object.keys(e);for(const b of n){const r=e[b];let h="default";r.classes.length>0&&(h=r.classes.join(" ")),h=h+" flowchart-label";const w=B(r.styles);let t=r.text!==void 0?r.text:r.id,s;if(g.info("vertex",r,r.labelType),r.labelType==="markdown")g.info("vertex",r,r.labelType);else if(j(S().flowchart.htmlLabels))s=te(u,{label:t}).node(),s.parentNode.removeChild(s);else{const k=i.createElementNS("http://www.w3.org/2000/svg","text");k.setAttribute("style",w.labelStyle.replace("color:","fill:"));const _=t.split(z.lineBreakRegex);for(const $ of _){const v=i.createElementNS("http://www.w3.org/2000/svg","tspan");v.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve"),v.setAttribute("dy","1em"),v.setAttribute("x","1"),v.textContent=$,k.appendChild(v)}s=k}let p=0,o="";switch(r.type){case"round":p=5,o="rect";break;case"square":o="rect";break;case"diamond":o="question";break;case"hexagon":o="hexagon";break;case"odd":o="rect_left_inv_arrow";break;case"lean_right":o="lean_right";break;case"lean_left":o="lean_left";break;case"trapezoid":o="trapezoid";break;case"inv_trapezoid":o="inv_trapezoid";break;case"odd_right":o="rect_left_inv_arrow";break;case"circle":o="circle";break;case"ellipse":o="ellipse";break;case"stadium":o="stadium";break;case"subroutine":o="subroutine";break;case"cylinder":o="cylinder";break;case"group":o="rect";break;case"doublecircle":o="doublecircle";break;default:o="rect"}const T=await G(t,S());l.setNode(r.id,{labelStyle:w.labelStyle,shape:o,labelText:T,labelType:r.labelType,rx:p,ry:p,class:h,style:w.style,id:r.id,link:r.link,linkTarget:r.linkTarget,tooltip:d.db.getTooltip(r.id)||"",domId:d.db.lookUpDomId(r.id),haveCallback:r.haveCallback,width:r.type==="group"?500:void 0,dir:r.dir,type:r.type,props:r.props,padding:S().flowchart.padding}),g.info("setNode",{labelStyle:w.labelStyle,labelType:r.labelType,shape:o,labelText:T,rx:p,ry:p,class:h,style:w.style,id:r.id,domId:d.db.lookUpDomId(r.id),width:r.type==="group"?500:void 0,type:r.type,dir:r.dir,props:r.props,padding:S().flowchart.padding})}},q=async function(e,l,c){g.info("abc78 edges = ",e);let a=0,i={},d,u;if(e.defaultStyle!==void 0){const n=B(e.defaultStyle);d=n.style,u=n.labelStyle}for(const n of e){a++;const b="L-"+n.start+"-"+n.end;i[b]===void 0?(i[b]=0,g.info("abc78 new entry",b,i[b])):(i[b]++,g.info("abc78 new entry",b,i[b]));let r=b+"-"+i[b];g.info("abc78 new link id to be used is",b,r,i[b]);const h="LS-"+n.start,w="LE-"+n.end,t={style:"",labelStyle:""};switch(t.minlen=n.length||1,n.type==="arrow_open"?t.arrowhead="none":t.arrowhead="normal",t.arrowTypeStart="arrow_open",t.arrowTypeEnd="arrow_open",n.type){case"double_arrow_cross":t.arrowTypeStart="arrow_cross";case"arrow_cross":t.arrowTypeEnd="arrow_cross";break;case"double_arrow_point":t.arrowTypeStart="arrow_point";case"arrow_point":t.arrowTypeEnd="arrow_point";break;case"double_arrow_circle":t.arrowTypeStart="arrow_circle";case"arrow_circle":t.arrowTypeEnd="arrow_circle";break}let s="",p="";switch(n.stroke){case"normal":s="fill:none;",d!==void 0&&(s=d),u!==void 0&&(p=u),t.thickness="normal",t.pattern="solid";break;case"dotted":t.thickness="normal",t.pattern="dotted",t.style="fill:none;stroke-width:2px;stroke-dasharray:3;";break;case"thick":t.thickness="thick",t.pattern="solid",t.style="stroke-width: 3.5px;fill:none;";break;case"invisible":t.thickness="invisible",t.pattern="solid",t.style="stroke-width: 0;fill:none;";break}if(n.style!==void 0){const o=B(n.style);s=o.style,p=o.labelStyle}t.style=t.style+=s,t.labelStyle=t.labelStyle+=p,n.interpolate!==void 0?t.curve=L(n.interpolate,E):e.defaultInterpolate!==void 0?t.curve=L(e.defaultInterpolate,E):t.curve=L(V.curve,E),n.text===void 0?n.style!==void 0&&(t.arrowheadStyle="fill: #333"):(t.arrowheadStyle="fill: #333",t.labelpos="c"),t.labelType=n.labelType,t.label=await G(n.text.replace(z.lineBreakRegex,`
`),S()),n.style===void 0&&(t.style=t.style||"stroke: #333; stroke-width: 1.5px;fill:none;"),t.labelStyle=t.labelStyle.replace("color:","fill:"),t.id=r,t.classes="flowchart-link "+h+" "+w,l.setEdge(n.start,n.end,t,a)}},le=function(e,l){return l.db.getClasses()},ae=async function(e,l,c,a){g.info("Drawing flowchart");let i=a.db.getDirection();i===void 0&&(i="TD");const{securityLevel:d,flowchart:u}=S(),n=u.nodeSpacing||50,b=u.rankSpacing||50;let r;d==="sandbox"&&(r=C("#i"+l));const h=d==="sandbox"?C(r.nodes()[0].contentDocument.body):C("body"),w=d==="sandbox"?r.nodes()[0].contentDocument:document,t=new J({multigraph:!0,compound:!0}).setGraph({rankdir:i,nodesep:n,ranksep:b,marginx:0,marginy:0}).setDefaultEdgeLabel(function(){return{}});let s;const p=a.db.getSubGraphs();g.info("Subgraphs - ",p);for(let f=p.length-1;f>=0;f--)s=p[f],g.info("Subgraph - ",s),a.db.addVertex(s.id,{text:s.title,type:s.labelType},"group",void 0,s.classes,s.dir);const o=a.db.getVertices(),T=a.db.getEdges();g.info("Edges",T);let k=0;for(k=p.length-1;k>=0;k--){s=p[k],Z("cluster").append("text");for(let f=0;f<s.nodes.length;f++)g.info("Setting up subgraphs",s.nodes[f],s.id),t.setParent(s.nodes[f],s.id)}await P(o,t,l,h,w,a),await q(T,t);const _=h.select(`[id="${l}"]`),$=h.select("#"+l+" g");if(await Q($,t,["point","circle","cross"],"flowchart",l),W.insertTitle(_,"flowchartTitleText",u.titleTopMargin,a.db.getDiagramTitle()),X(t,_,u.diagramPadding,u.useMaxWidth),a.db.indexNodes("subGraph"+k),!u.htmlLabels){const f=w.querySelectorAll('[id="'+l+'"] .edgeLabel .label');for(const x of f){const m=x.getBBox(),y=w.createElementNS("http://www.w3.org/2000/svg","rect");y.setAttribute("rx",0),y.setAttribute("ry",0),y.setAttribute("width",m.width),y.setAttribute("height",m.height),x.insertBefore(y,x.firstChild)}}Object.keys(o).forEach(function(f){const x=o[f];if(x.link){const m=C("#"+l+' [id="'+f+'"]');if(m){const y=w.createElementNS("http://www.w3.org/2000/svg","a");y.setAttributeNS("http://www.w3.org/2000/svg","class",x.classes.join(" ")),y.setAttributeNS("http://www.w3.org/2000/svg","href",x.link),y.setAttributeNS("http://www.w3.org/2000/svg","rel","noopener"),d==="sandbox"?y.setAttributeNS("http://www.w3.org/2000/svg","target","_top"):x.linkTarget&&y.setAttributeNS("http://www.w3.org/2000/svg","target",x.linkTarget);const D=m.insert(function(){return y},":first-child"),N=m.select(".label-container");N&&D.append(function(){return N.node()});const A=m.select(".label");A&&D.append(function(){return A.node()})}}})},we={setConf:re,addVertices:P,addEdges:q,getClasses:le,draw:ae},oe=(e,l)=>{const c=Y,a=c(e,"r"),i=c(e,"g"),d=c(e,"b");return H(a,i,d,l)},ne=e=>`.label {
    font-family: ${e.fontFamily};
    color: ${e.nodeTextColor||e.textColor};
  }
  .cluster-label text {
    fill: ${e.titleColor};
  }
  .cluster-label span,p {
    color: ${e.titleColor};
  }

  .label text,span,p {
    fill: ${e.nodeTextColor||e.textColor};
    color: ${e.nodeTextColor||e.textColor};
  }

  .node rect,
  .node circle,
  .node ellipse,
  .node polygon,
  .node path {
    fill: ${e.mainBkg};
    stroke: ${e.nodeBorder};
    stroke-width: 1px;
  }
  .flowchart-label text {
    text-anchor: middle;
  }
  // .flowchart-label .text-outer-tspan {
  //   text-anchor: middle;
  // }
  // .flowchart-label .text-inner-tspan {
  //   text-anchor: start;
  // }

  .node .katex path {
    fill: #000;
    stroke: #000;
    stroke-width: 1px;
  }

  .node .label {
    text-align: center;
  }
  .node.clickable {
    cursor: pointer;
  }

  .arrowheadPath {
    fill: ${e.arrowheadColor};
  }

  .edgePath .path {
    stroke: ${e.lineColor};
    stroke-width: 2.0px;
  }

  .flowchart-link {
    stroke: ${e.lineColor};
    fill: none;
  }

  .edgeLabel {
    background-color: ${e.edgeLabelBackground};
    rect {
      opacity: 0.5;
      background-color: ${e.edgeLabelBackground};
      fill: ${e.edgeLabelBackground};
    }
    text-align: center;
  }

  /* For html labels only */
  .labelBkg {
    background-color: ${oe(e.edgeLabelBackground,.5)};
    // background-color: 
  }

  .cluster rect {
    fill: ${e.clusterBkg};
    stroke: ${e.clusterBorder};
    stroke-width: 1px;
  }

  .cluster text {
    fill: ${e.titleColor};
  }

  .cluster span,p {
    color: ${e.titleColor};
  }
  /* .cluster div {
    color: ${e.titleColor};
  } */

  div.mermaidTooltip {
    position: absolute;
    text-align: center;
    max-width: 200px;
    padding: 2px;
    font-family: ${e.fontFamily};
    font-size: 12px;
    background: ${e.tertiaryColor};
    border: 1px solid ${e.border2};
    border-radius: 2px;
    pointer-events: none;
    z-index: 100;
  }

  .flowchartTitleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${e.textColor};
  }
`,ye=ne;export{ee as a,te as b,ue as c,fe as d,pe as e,ye as f,we as g,be as i,Z as s};
//# sourceMappingURL=styles-d45a18b0-DOV3oSpe.js.map
