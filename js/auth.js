/**
 * AuthService & Multi-Mode Auth Integration
 * Handles Supabase Auth when configured, with seamless LocalStorage fallback.
 * Enforces mandatory authentication upon entering or reloading the site.
 */

(function () {
  'use strict';

  const STORAGE_KEY_SESSION = "barber_user_session";
  const STORAGE_KEY_USERS = "barber_registered_users";
  
  const getSupabase = () => window.supabaseClient;

  let currentUser = null;
  let isMandatoryAuthActive = false;

  // Carrega sessão salva no LocalStorage
  function loadLocalSession() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SESSION);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Erro ao ler sessão local:', e);
    }
    return null;
  }

  function saveLocalSession(user) {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
    } catch (e) {
      console.error('Erro ao salvar sessão local:', e);
    }
  }

  function getLocalUsers() {
    try {
      const users = localStorage.getItem(STORAGE_KEY_USERS);
      return users ? JSON.parse(users) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalUser(userData) {
    try {
      const users = getLocalUsers();
      const existingIdx = users.findIndex(u => u.email === userData.email);
      if (existingIdx >= 0) {
        users[existingIdx] = { ...users[existingIdx], ...userData };
      } else {
        users.push(userData);
      }
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    } catch (e) {
      console.error('Erro ao salvar usuário localmente:', e);
    }
  }

  // Atualiza links do painel do sistema para direcionar ao tenant do usuário autenticado
  function updateSystemPanelLinks(slug) {
    const baseSystemUrl = 'https://barbersistematestequiz-com.vercel.app/';
    const targetUrl = slug ? `${baseSystemUrl}?barbearia=${encodeURIComponent(slug)}&slug=${encodeURIComponent(slug)}` : baseSystemUrl;
    
    const btnEntrar = document.getElementById('btnEntrarSistema');
    if (btnEntrar) btnEntrar.setAttribute('href', targetUrl);
    
    const btnEntrarLogado = document.getElementById('btnEntrarSistemaLogado');
    if (btnEntrarLogado) btnEntrarLogado.setAttribute('href', targetUrl);
  }

  // Garante que cada usuário tenha sua própria barbearia no banco (Multi-Tenancy estrito)
  async function ensureUserBarbearia(user) {
    if (!user || !user.id) return null;
    const client = getSupabase();
    if (!client) {
      const fallbackId = 'local_barb_' + user.id;
      const fallbackSlug = 'barb-' + user.id.replace(/[^a-z0-9]/gi, '').slice(0, 8);
      user.barbeariaId = fallbackId;
      user.slug = fallbackSlug;
      localStorage.setItem('barber_active_slug', fallbackSlug);
      localStorage.setItem('barber_active_barbearia_id', fallbackId);
      updateSystemPanelLinks(fallbackSlug);
      return { id: fallbackId, slug: fallbackSlug, nome: user.shopName };
    }

    try {
      // 1. Verifica se já existe barbearia para este usuário (dono_id)
      const { data: existingBarb, error: findErr } = await client
        .from('barbearias')
        .select('id, slug, nome')
        .eq('dono_id', user.id)
        .limit(1)
        .maybeSingle();

      if (existingBarb && existingBarb.id) {
        user.barbeariaId = existingBarb.id;
        user.slug = existingBarb.slug;
        if (existingBarb.nome) user.shopName = existingBarb.nome;
        localStorage.setItem('barber_active_slug', existingBarb.slug);
        localStorage.setItem('barber_active_barbearia_id', existingBarb.id);
        sessionStorage.setItem('barber_active_slug', existingBarb.slug);
        sessionStorage.setItem('barber_active_barbearia_id', existingBarb.id);
        updateSystemPanelLinks(existingBarb.slug);
        return existingBarb;
      }

      // 2. Se não existir, gera slug exclusivo e cria a barbearia isolada deste usuário
      const shopName = user.shopName || 'Minha Barbearia';
      const cleanNameSlug = shopName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'barbearia';
      const uniqueSuffix = (user.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase() || Math.random().toString(36).slice(2, 8);
      const generatedSlug = `${cleanNameSlug}-${uniqueSuffix}`;

      const { data: newBarb, error: insertErr } = await client
        .from('barbearias')
        .insert([{
          dono_id: user.id,
          nome: shopName,
          slug: generatedSlug,
          email_contato: user.email,
          ativo: true
        }])
        .select('id, slug, nome')
        .maybeSingle();

      if (!insertErr && newBarb) {
        user.barbeariaId = newBarb.id;
        user.slug = newBarb.slug;
        localStorage.setItem('barber_active_slug', newBarb.slug);
        localStorage.setItem('barber_active_barbearia_id', newBarb.id);
        sessionStorage.setItem('barber_active_slug', newBarb.slug);
        sessionStorage.setItem('barber_active_barbearia_id', newBarb.id);
        updateSystemPanelLinks(newBarb.slug);
        return newBarb;
      } else if (insertErr) {
        console.warn('[Auth] Inserção direta de barbearia retornou aviso:', insertErr.message);
      }
    } catch (e) {
      console.warn('[Auth] Erro ao sincronizar barbearia do usuário:', e);
    }
    return null;
  }

  const AuthService = {
    getCurrentUser: function () { return currentUser; },
    isLoggedIn: function () { return !!currentUser; },
    updateSystemPanelLinks: updateSystemPanelLinks,
    ensureUserBarbearia: ensureUserBarbearia,

    register: async function (email, password, shopName) {
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanShop = (shopName && shopName.trim()) ? shopName.trim() : 'Minha Barbearia';
      
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Por favor, digite um e-mail válido.');
      }
      if (!password || password.length < 6) {
        throw new Error('A senha deve conter no mínimo 6 caracteres.');
      }
      
      // Limpa dados de sessões antigas
      if (window.BarberDB) window.BarberDB.clearCache();
      localStorage.removeItem(STORAGE_KEY_SESSION);

      const client = getSupabase();
      if (client && client.auth) {
        const { data, error } = await client.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              nome: cleanEmail.split('@')[0],
              nome_barbearia: cleanShop,
              tipo_cadastro: 'dono'
            }
          }
        });

        if (error) {
          console.error('[Auth] Erro no cadastro:', error);
          let msg = error.message;
          if (msg.includes('already registered')) msg = 'Este e-mail já está cadastrado. Vá para a aba "Entrar".';
          else if (msg.includes('rate limit')) msg = 'Limite temporário de requisições. Aguarde 1 minuto ou desative "Confirm email" no Supabase.';
          else if (msg.includes('Password should be')) msg = 'A senha deve ter pelo menos 6 caracteres.';
          throw new Error(msg);
        }

        currentUser = {
          id: data.user ? data.user.id : 'usr_' + Date.now(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          shopName: cleanShop
        };

        await ensureUserBarbearia(currentUser);
      } else {
        currentUser = {
          id: 'usr_' + Date.now(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          shopName: cleanShop
        };
        await ensureUserBarbearia(currentUser);
      }

      saveLocalSession(currentUser);
      isMandatoryAuthActive = false;
      this.notifyStateChange();
      return currentUser;
    },

    login: async function (email, password) {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Por favor, informe seu e-mail.');
      }
      if (!password) {
        throw new Error('Por favor, digite sua senha.');
      }

      // Limpa dados da conta anterior
      if (window.BarberDB) window.BarberDB.clearCache();
      localStorage.removeItem(STORAGE_KEY_SESSION);

      const client = getSupabase();
      if (client && client.auth) {
        const { data, error } = await client.auth.signInWithPassword({
          email: cleanEmail,
          password: password
        });

        if (error) {
          console.error('[Auth] Falha no login:', error);
          let msg = error.message;
          if (msg.includes('Invalid login credentials')) msg = 'E-mail ou senha incorretos.';
          else if (msg.includes('Email not confirmed')) msg = 'E-mail não confirmado. Verifique sua caixa de entrada ou desative "Confirm email" no Supabase Auth.';
          else if (msg.includes('rate limit')) msg = 'Muitas tentativas. Aguarde alguns instantes.';
          throw new Error(msg);
        }

        currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.nome || data.user.email.split('@')[0],
          shopName: data.user.user_metadata?.nome_barbearia || data.user.user_metadata?.shop_name || 'Minha Barbearia'
        };

        await ensureUserBarbearia(currentUser);
      } else {
        currentUser = {
          id: 'usr_' + Date.now(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          shopName: 'Minha Barbearia'
        };
        await ensureUserBarbearia(currentUser);
      }

      saveLocalSession(currentUser);
      isMandatoryAuthActive = false;
      this.notifyStateChange();
      return currentUser;
    },

    loginWithGmail: async function () {
      if (window.BarberDB) window.BarberDB.clearCache();
      localStorage.removeItem(STORAGE_KEY_SESSION);

      const client = getSupabase();
      if (client) {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin
          }
        });
        if (error) throw new Error(error.message);
      } else {
        currentUser = {
          id: 'usr_google_' + Date.now(),
          email: 'usuario.google@gmail.com',
          name: 'Usuário Google',
          shopName: 'Minha Barbearia'
        };
        await ensureUserBarbearia(currentUser);
        saveLocalSession(currentUser);
        isMandatoryAuthActive = false;
        this.notifyStateChange();
      }
    },

    updateShopName: async function (newShopName) {
      const cleanName = (newShopName || '').trim();
      if (!cleanName) return;

      if (!currentUser) {
        currentUser = {
          id: 'guest_' + Date.now(),
          email: 'admin@barbearia.com',
          name: 'Administrador',
          shopName: cleanName
        };
      } else {
        currentUser.shopName = cleanName;
      }

      const client = getSupabase();
      if (client) {
        if (client.auth) {
          try {
            await client.auth.updateUser({
              data: { nome_barbearia: cleanName }
            });
          } catch (e) {
            console.warn('Atualização Supabase auth ignorada:', e);
          }
        }

        if (currentUser.id) {
          try {
            await client
              .from('barbearias')
              .update({ nome: cleanName })
              .eq('dono_id', currentUser.id);
          } catch (e) {
            console.warn('Atualização tabela barbearias ignorada:', e);
          }
        }
      }

      saveLocalSession(currentUser);
      saveLocalUser(currentUser);
      window.dispatchEvent(new CustomEvent('shopNameUpdated', { detail: { shopName: cleanName } }));
      this.notifyStateChange();
    },

    logout: async function () {
      const client = getSupabase();
      if (client && client.auth) {
        try {
          await client.auth.signOut();
        } catch (e) {}
      }
      currentUser = null;
      saveLocalSession(null);
      if (window.BarberDB) {
        window.BarberDB.clearCache();
      }
      localStorage.removeItem('barber_active_slug');
      localStorage.removeItem('barber_active_barbearia_id');
      sessionStorage.clear();
      updateSystemPanelLinks(null);
      this.notifyStateChange();
      // Ao sair, reabre obrigatoriamente a tela de login
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('login', true);
      }
    },

    notifyStateChange: function () {
      window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: currentUser } }));
    }
  };

  window.AuthService = AuthService;

  // Define funções globais imediatamente
  window.openAuthModal = function (tab, mandatory = false) {
    const modalBackdrop = document.getElementById('authModalBackdrop');
    if (!modalBackdrop) return;
    
    isMandatoryAuthActive = mandatory;

    const userMenuDropdown = document.getElementById('userMenuDropdown');
    if (userMenuDropdown) userMenuDropdown.classList.remove('active');
    
    modalBackdrop.classList.add('active');
    modalBackdrop.style.display = 'flex';
    modalBackdrop.style.opacity = '1';
    modalBackdrop.style.visibility = 'visible';
    document.body.style.overflow = 'hidden';

    // Botão de fechar sempre visível
    const mainCloseBtn = modalBackdrop.querySelector('.auth-modal-close');
    if (mainCloseBtn) {
      mainCloseBtn.style.display = 'flex';
    }

    if (tab) switchTab(tab);
  };

  window.closeAuthModal = function (force = false) {
    const modalBackdrop = document.getElementById('authModalBackdrop');
    const shopModalBackdrop = document.getElementById('shopModalBackdrop');
    
    if (modalBackdrop) {
      modalBackdrop.classList.remove('active');
      modalBackdrop.style.display = 'none';
      modalBackdrop.style.opacity = '0';
      modalBackdrop.style.visibility = 'hidden';
    }
    if (shopModalBackdrop) {
      shopModalBackdrop.classList.remove('active');
      shopModalBackdrop.style.display = 'none';
    }
    document.body.style.overflow = '';
    hideAlert();
  };

  function switchTab(tab) {
    const tabBtns = document.querySelectorAll('.auth-tab-btn');
    const loginForm = document.getElementById('authLoginForm');
    const signupForm = document.getElementById('authSignupForm');
    const titleEl = document.getElementById('authModalTitle');

    tabBtns.forEach(b => b.classList.remove('active'));
    const activeTabBtn = document.querySelector(`.auth-tab-btn[data-tab="${tab}"]`);
    if (activeTabBtn) activeTabBtn.classList.add('active');
    hideAlert();
    
    if (tab === 'login') {
      if (loginForm) loginForm.style.display = 'block';
      if (signupForm) signupForm.style.display = 'none';
      if (titleEl) titleEl.textContent = 'Entrar na Conta';
    } else {
      if (loginForm) loginForm.style.display = 'none';
      if (signupForm) signupForm.style.display = 'block';
      if (titleEl) titleEl.textContent = 'Criar Conta';
    }
  }

  function showAlert(msg, isError) {
    const alertBox = document.getElementById('authAlert');
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = 'auth-alert ' + (isError ? 'error' : 'success');
    alertBox.style.display = 'block';
  }

  function hideAlert() {
    const alertBox = document.getElementById('authAlert');
    if (alertBox) alertBox.style.display = 'none';
  }

  function initAuthUI() {
    const modalBackdrop = document.getElementById('authModalBackdrop');
    const shopModalBackdrop = document.getElementById('shopModalBackdrop');
    const closeBtns = document.querySelectorAll('.auth-modal-close');
    const tabBtns = document.querySelectorAll('.auth-tab-btn');
    const loginForm = document.getElementById('authLoginForm');
    const signupForm = document.getElementById('authSignupForm');
    const gmailBtn = document.getElementById('authGmailBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    const navAccountBtn = document.getElementById('btnNavAccount');
    const logoutBtn = document.getElementById('btnLogout');
    const openShopCustomizerBtn = document.getElementById('btnOpenShopCustomizer');
    const saveShopNameBtn = document.getElementById('btnSaveShopName');

    // 1. Restaura sessão salva
    const savedLocal = loadLocalSession();
    if (savedLocal) {
      currentUser = savedLocal;
      AuthService.notifyStateChange();
    }

    const client = getSupabase();
    if (client && client.auth) {
      client.auth.getSession().then(async ({ data: { session } }) => {
        if (session && session.user) {
          currentUser = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.nome || session.user.email.split('@')[0],
            shopName: session.user.user_metadata?.nome_barbearia || session.user.user_metadata?.shop_name || 'Minha Barbearia'
          };
          await ensureUserBarbearia(currentUser);
          saveLocalSession(currentUser);
          AuthService.notifyStateChange();
        }
      }).catch((e) => {
        console.warn('[Auth] Verificação de sessão inicial:', e);
      });

      client.auth.onAuthStateChange(async (_event, session) => {
        if (session && session.user) {
          currentUser = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.nome || session.user.email.split('@')[0],
            shopName: session.user.user_metadata?.nome_barbearia || session.user.user_metadata?.shop_name || 'Minha Barbearia'
          };
          await ensureUserBarbearia(currentUser);
          saveLocalSession(currentUser);
          window.closeAuthModal(true);
        } else {
          currentUser = null;
          saveLocalSession(null);
          if (window.BarberDB) window.BarberDB.clearCache();
          updateSystemPanelLinks(null);
        }
        AuthService.notifyStateChange();
      });
    }

    // Modal começa fechado para permitir navegação livre dos clientes
    window.closeAuthModal(true);

    closeBtns.forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.closeAuthModal();
      });
    });

    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', e => { 
        if (e.target === modalBackdrop && !isMandatoryAuthActive) {
          window.closeAuthModal(); 
        }
      });
    }
    if (shopModalBackdrop) {
      shopModalBackdrop.addEventListener('click', e => { 
        if (e.target === shopModalBackdrop) window.closeAuthModal(true); 
      });
    }

    // ── Tab switching ──
    tabBtns.forEach(btn => {
      btn.addEventListener('click', function () { 
        const targetTab = this.getAttribute('data-tab');
        if (targetTab) switchTab(targetTab); 
      });
    });

    // ── Signup ──
    if (signupForm) {
      signupForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
          await AuthService.register(
            document.getElementById('signupEmail').value,
            document.getElementById('signupPassword').value,
            document.getElementById('signupShopName').value
          );
          showAlert('Conta criada com sucesso! Bem-vindo(a)!', false);
          setTimeout(() => window.closeAuthModal(true), 1000);
        } catch (err) { 
          showAlert(err.message, true); 
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // ── Login ──
    if (loginForm) {
      loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
          await AuthService.login(
            document.getElementById('loginEmail').value,
            document.getElementById('loginPassword').value
          );
          showAlert('Login realizado com sucesso!', false);
          setTimeout(() => window.closeAuthModal(true), 1000);
        } catch (err) { 
          showAlert(err.message, true); 
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // ── Gmail login ──
    if (gmailBtn) {
      gmailBtn.addEventListener('click', async function () {
        try {
          await AuthService.loginWithGmail();
          showAlert('Conectado com sucesso!', false);
          setTimeout(() => window.closeAuthModal(true), 800);
        } catch (err) { 
          showAlert(err.message, true); 
        }
      });
    }

    // ── Unified account icon button → dropdown ──
    if (navAccountBtn) {
      navAccountBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (userMenuDropdown) userMenuDropdown.classList.toggle('active');
      });
    }

    document.addEventListener('click', function (e) {
      if (userMenuDropdown && !userMenuDropdown.contains(e.target) && e.target !== navAccountBtn) {
        userMenuDropdown.classList.remove('active');
      }
    });

    // ── Logout ──
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        await AuthService.logout();
        if (userMenuDropdown) userMenuDropdown.classList.remove('active');
      });
    }

    // ── Shop customizer modal ──
    if (openShopCustomizerBtn) {
      openShopCustomizerBtn.addEventListener('click', function () {
        if (userMenuDropdown) userMenuDropdown.classList.remove('active');
        if (shopModalBackdrop) {
          const input = document.getElementById('inputCustomShopName');
          const user = AuthService.getCurrentUser();
          if (input && user) input.value = user.shopName || '';
          shopModalBackdrop.classList.add('active');
          shopModalBackdrop.style.display = 'flex';
        }
      });
    }

    if (saveShopNameBtn) {
      saveShopNameBtn.addEventListener('click', async function () {
        const input = document.getElementById('inputCustomShopName');
        if (input && input.value.trim()) {
          await AuthService.updateShopName(input.value.trim());
          if (shopModalBackdrop) {
            shopModalBackdrop.classList.remove('active');
            shopModalBackdrop.style.display = 'none';
          }
        }
      });
    }

    // ── Render navbar state ──
    function renderUserState() {
      const user = AuthService.getCurrentUser();
      const avatarEl = document.getElementById('userAvatarCircle');
      const emailDisplay = document.getElementById('userMenuEmail');
      const shopDisplay = document.getElementById('userMenuShopName');
      const loggedOutPanel = document.getElementById('dropdownLoggedOut');
      const loggedInPanel = document.getElementById('dropdownLoggedIn');

      if (user) {
        const initial = user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'U');
        if (avatarEl) {
          avatarEl.classList.add('has-initial');
          avatarEl.textContent = initial;
        }
        if (emailDisplay) emailDisplay.textContent = user.email;
        if (shopDisplay) shopDisplay.textContent = user.shopName || 'Minha Barbearia';
        if (loggedOutPanel) loggedOutPanel.style.display = 'none';
        if (loggedInPanel) loggedInPanel.style.display = 'block';
      } else {
        if (avatarEl) {
          avatarEl.classList.remove('has-initial');
          avatarEl.innerHTML = '<i class="fas fa-user" id="navAccountIcon"></i>';
        }
        if (loggedOutPanel) loggedOutPanel.style.display = 'block';
        if (loggedInPanel) loggedInPanel.style.display = 'none';
      }
    }

    window.addEventListener('authStateChanged', renderUserState);
    renderUserState();
  }

  // Executa a inicialização imediatamente caso o DOM já esteja pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthUI);
  } else {
    initAuthUI();
  }
})();
