!function(){class e{constructor(){this.initSettings(),this.initElements(),this.bindEvents()}initSettings(){this.settings={selectors:{menuToggle:".site-header .site-navigation-toggle",menuToggleHolder:".site-header .site-navigation-toggle-holder",dropdownMenu:".site-header .site-navigation-dropdown"}}}initElements(){this.elements={window:window,menuToggle:document.querySelector(this.settings.selectors.menuToggle),menuToggleHolder:document.querySelector(this.settings.selectors.menuToggleHolder),dropdownMenu:document.querySelector(this.settings.selectors.dropdownMenu)}}bindEvents(){this.elements.menuToggleHolder&&!this.elements.menuToggleHolder?.classList.contains("hide")&&(this.elements.menuToggle.addEventListener("click",()=>this.handleMenuToggle()),this.elements.dropdownMenu.querySelectorAll(".menu-item-has-children > a").forEach(e=>e.addEventListener("click",e=>this.handleMenuChildren(e))))}closeMenuItems(){this.elements.menuToggleHolder.classList.remove("elementor-active"),this.elements.window.removeEventListener("resize",()=>this.closeMenuItems())}handleMenuToggle(){const e=!this.elements.menuToggleHolder.classList.contains("elementor-active");this.elements.menuToggle.setAttribute("aria-expanded",e),this.elements.dropdownMenu.setAttribute("aria-hidden",!e),this.elements.dropdownMenu.inert=!e,this.elements.menuToggleHolder.classList.toggle("elementor-active",e),this.elements.dropdownMenu.querySelectorAll(".elementor-active").forEach(e=>e.classList.remove("elementor-active")),e?this.elements.window.addEventListener("resize",()=>this.closeMenuItems()):this.elements.window.removeEventListener("resize",()=>this.closeMenuItems())}handleMenuChildren(e){const t=e.currentTarget.parentElement;t?.classList&&t.classList.toggle("elementor-active")}}document.addEventListener("DOMContentLoaded",()=>{new e})}();

// CUSTOM NAVBAR LOGIC
document.addEventListener('DOMContentLoaded', () => {
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if(mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    const dropdowns = document.querySelectorAll('#custom-glass-navbar .dropdown, #custom-glass-navbar .dropdown-group');
    dropdowns.forEach(dropdown => {
        const link = dropdown.querySelector('a');
        if(link) {
            link.addEventListener('click', (e) => {
                if (window.innerWidth <= 1024 || dropdown.classList.contains('dropdown-group')) {
                    e.preventDefault();
                    dropdown.classList.toggle('active');
                }
            });
        }
    });

    // Close mobile menu on outside click
    document.addEventListener('click', (e) => {
        const navbar = document.getElementById('custom-glass-navbar');
        if (navbar && !navbar.contains(e.target)) {
            navLinks.classList.remove('active');
            dropdowns.forEach(d => d.classList.remove('active'));
        }
    });
});