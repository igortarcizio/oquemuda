/** Movimento discreto da interrogação da marca, independente das rotas. */
export function initBrandQuestion(root = document.querySelector('.brand')) {
  const mark=root?.querySelector('.brand-question');
  if(!mark)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function replay(){
    if(reduced.matches)return;
    mark.classList.remove('is-curious');
    // Reinicia a animação mesmo em cliques ou entradas rápidas consecutivas.
    void mark.offsetWidth;
    mark.classList.add('is-curious');
  }
  mark.addEventListener('pointerenter',replay);
  // O clique mantém o comportamento normal de navegação da marca.
  root.addEventListener('click',replay);
  mark.addEventListener('animationend',event=>{
    if(event.animationName==='brand-question-trigger')mark.classList.remove('is-curious');
  });
}
