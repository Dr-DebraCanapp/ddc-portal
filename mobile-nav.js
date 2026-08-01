/* Self-contained mobile nav: hamburger + full-screen menu. Works on every page
   (reads the existing .nav-links, injects its own CSS). No dependencies. */
(function(){
  function init(){
    var inner=document.querySelector('.nav-bar .nav-inner');
    if(!inner||document.getElementById('mnav-style'))return;

    var css=[
      'html,body{overflow-x:clip;}',
      '.mnav-toggle{display:none;flex-direction:column;justify-content:center;gap:6px;width:44px;height:44px;margin-left:auto;flex:0 0 auto;padding:0;background:none;border:none;cursor:pointer;}',
      '.mnav-toggle span{display:block;width:26px;height:2px;background:var(--ink);margin:0 auto;transition:transform .3s cubic-bezier(.2,.7,.2,1),opacity .2s ease,background .2s ease;}',
      '.mnav-toggle.is-open{position:fixed;top:12px;right:20px;z-index:130;}',
      '.mnav-toggle.is-open span{background:var(--paper);}',
      '.mnav-toggle.is-open span:nth-child(1){transform:translateY(8px) rotate(45deg);}',
      '.mnav-toggle.is-open span:nth-child(2){opacity:0;}',
      '.mnav-toggle.is-open span:nth-child(3){transform:translateY(-8px) rotate(-45deg);}',
      '.mnav-panel{position:fixed;inset:0;background:var(--ink);color:var(--paper);z-index:110;display:flex;flex-direction:column;padding:92px 32px 40px;transform:translateY(-100%);opacity:0;visibility:hidden;transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s ease,visibility .45s;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      '.mnav-panel.is-open{transform:translateY(0);opacity:1;visibility:visible;}',
      '.mnav-links{display:flex;flex-direction:column;gap:2px;}',
      '.mnav-panel a.mnav-link{font-family:var(--serif);font-weight:400;font-size:clamp(32px,9vw,48px);line-height:1.3;color:var(--paper);padding:4px 0;letter-spacing:-0.01em;text-decoration:none;}',
      '.mnav-panel a.mnav-link.active{color:var(--tan);}',
      '.mnav-foot{margin-top:auto;padding-top:30px;display:flex;flex-direction:column;gap:18px;border-top:1px solid rgba(244,239,229,.2);}',
      '.mnav-foot .mnav-portal{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--tan);text-decoration:none;}',
      '.mnav-foot .mnav-contact{align-self:flex-start;}',
      'body.mnav-lock{overflow:hidden;}',
      '@media (max-width:980px){.mnav-toggle{display:flex;}.nav-bar .nav-right{display:none!important;}}',
      '@media (min-width:981px){.mnav-panel{display:none!important;}.mnav-toggle{display:none!important;}}'
    ].join('');
    var st=document.createElement('style');st.id='mnav-style';st.textContent=css;document.head.appendChild(st);

    var btn=document.createElement('button');
    btn.className='mnav-toggle';btn.type='button';
    btn.setAttribute('aria-label','Open menu');btn.setAttribute('aria-expanded','false');
    btn.innerHTML='<span></span><span></span><span></span>';
    inner.appendChild(btn);

    var links='';
    document.querySelectorAll('.nav-bar .nav-links a').forEach(function(a){
      links+='<a class="mnav-link'+(a.classList.contains('active')?' active':'')+'" href="'+a.getAttribute('href')+'">'+a.textContent.trim()+'</a>';
    });
    var portalEl=document.querySelector('.nav-bar .nav-portal');
    var portalHref=portalEl?portalEl.getAttribute('href'):'https://portal.drdebracanapp.com';

    var panel=document.createElement('div');
    panel.className='mnav-panel';
    panel.innerHTML='<div class="mnav-links">'+links+'</div>'+
      '<div class="mnav-foot">'+
      '<a class="mnav-portal" href="'+portalHref+'">Portal login &rarr;</a>'+
      '<a class="mnav-contact btn clay" href="mailto:info@drdebracanapp.com">Contact</a>'+
      '</div>';
    document.body.appendChild(panel);

    function setOpen(o){
      btn.classList.toggle('is-open',o);
      panel.classList.toggle('is-open',o);
      document.body.classList.toggle('mnav-lock',o);
      btn.setAttribute('aria-expanded',o?'true':'false');
      btn.setAttribute('aria-label',o?'Close menu':'Open menu');
    }
    btn.addEventListener('click',function(){setOpen(!panel.classList.contains('is-open'));});
    panel.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){setOpen(false);});});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')setOpen(false);});
    window.addEventListener('resize',function(){if(window.innerWidth>980)setOpen(false);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
