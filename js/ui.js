export function lockScroll(locked){
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

export function openModal(html){
  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  content.innerHTML = html;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  lockScroll(true);
}

export function closeModal(){
  const modal = document.getElementById("modal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.getElementById("modalContent").innerHTML = "";
  lockScroll(false);
}
