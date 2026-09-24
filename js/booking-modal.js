document.addEventListener('DOMContentLoaded', () => {
    // Referência ao cliente centralizado do Supabase
    const db = window.BarberDB;

    // Estado do agendamento
    let state = {
        barbeariaId: null,
        services: [], // Lista carregada do banco
        profissionais: [], // Lista de profissionais da barbearia
        selectedServices: [],
        selectedProfissionalId: null, // null = Qualquer Barbeiro (Auto)
        selectedProfissionalName: 'Qualquer Barbeiro',
        date: null,
        dateFormattedYYYYMMDD: null,
        selectedDateObj: null,
        time: null,
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        referenceImageUrl: null,
        notes: '',
        payment: 'presencial' // 'presencial' ou 'pix'
    };

    // Dados de fallback para serviços se o banco ainda estiver carregando
    const fallbackServices = [
        { id: 's1', nome: 'O Corte de Cabelo', preco: 35, duracao_minutos: 40, descricao: 'Consulta personalizada, corte de precisão e finalização manual.' },
        { id: 's2', nome: 'Corte + Sobrancelha', preco: 50, duracao_minutos: 45, descricao: 'Corte de precisão alinhado com design profissional de sobrancelha.' },
        { id: 's3', nome: 'Corte + Aparagem de Barba', preco: 60, duracao_minutos: 50, descricao: 'Corte detalhado com escultura de barba e toalha quente.' }
    ];

    // Dados de fallback para profissionais
    const fallbackStaff = [
        { id: null, nome: 'Qualquer Barbeiro', especialidade: 'Primeiro disponível', avatar_url: '../images/LoMax-Barbers.png' },
        { id: 'lucas', nome: 'Lucas Silva', especialidade: 'Barbeiro Sênior', avatar_url: 'https://appointments-production-f.squarecdn.com/files/ca72fa4ade643e8d49ecca2d5b4d8f12/original.png' },
        { id: 'rafael', nome: 'Rafael Oliveira', especialidade: 'Barbeiro Sênior', avatar_url: 'https://appointments-production-f.squarecdn.com/files/db51fd462dd6c0bb996237af890dda54/original.png' },
        { id: 'mateus', nome: 'Mateus Santos', especialidade: 'Master Barbeiro', avatar_url: 'https://appointments-production-f.squarecdn.com/files/97f9cb2f4d7fc807814997bc6e8aace9/original.png' }
    ];

    // Cria o elemento modal no DOM
    createModalDOM();

    const overlay = document.getElementById('booking-modal-overlay');
    const closeBtn = document.getElementById('booking-modal-close');

    // Fases (Steps)
    const phase1 = document.getElementById('phase-1');
    const phase2 = document.getElementById('phase-2');
    const phase3 = document.getElementById('phase-3');
    const phase4 = document.getElementById('phase-4');
    const phase5 = document.getElementById('phase-5');
    const phase6 = document.getElementById('phase-6');

    // Botões de navegação
    const btnContinue1 = document.getElementById('btn-continue-1');
    const btnContinue2 = document.getElementById('btn-continue-2');
    const btnContinue3 = document.getElementById('btn-continue-3');
    const btnContinue4 = document.getElementById('btn-continue-4');
    const btnConfirm = document.getElementById('btn-confirm');

    const btnBack2 = document.getElementById('btn-back-2');
    const btnBack3 = document.getElementById('btn-back-3');
    const btnBack4 = document.getElementById('btn-back-4');
    const btnBack5 = document.getElementById('btn-back-5');

    // Elementos de listas e slots
    const servicesList = document.getElementById('services-list');
    const staffGrid = document.getElementById('staff-cards-grid');
    const timeSlotsList = document.getElementById('time-slots');
    const refFileInput = document.getElementById('customer-ref-file');
    const refPreviewContainer = document.getElementById('ref-preview-container');
    const refPreviewImg = document.getElementById('ref-preview-img');
    const refRemoveBtn = document.getElementById('ref-remove-btn');

    // Carregamento inicial de dados do banco
    async function initData() {
        if (!db) return;
        try {
            state.barbeariaId = await db.getBarbeariaId();
            if (state.barbeariaId) {
                const [servs, profs] = await Promise.all([
                    db.fetchServicos(state.barbeariaId),
                    db.fetchProfissionais(state.barbeariaId)
                ]);
                state.services = (servs && servs.length > 0) ? servs : fallbackServices;
                state.profissionais = (profs && profs.length > 0) ? profs : fallbackStaff.filter(s => s.id !== null);
            } else {
                state.services = fallbackServices;
                state.profissionais = fallbackStaff.filter(s => s.id !== null);
            }
        } catch (e) {
            console.warn('[Modal] Erro ao carregar dados do Supabase:', e);
            state.services = fallbackServices;
            state.profissionais = fallbackStaff.filter(s => s.id !== null);
        }
    }
    initData();

    window.addEventListener('authStateChanged', () => {
        initData();
    });
    function attachTriggerButtons() {
        const scheduleButtons = document.querySelectorAll('a[href*="agendamento"], a[href*="squareup.com"], .lomax-action, .elementor-button-text, .nav-book-btn, [data-action="book-modal"]');
        scheduleButtons.forEach(btn => {
            let targetElement = btn;
            if (btn.tagName === 'SPAN') {
                const parentLink = btn.closest('a');
                if (parentLink) targetElement = parentLink;
                else if (btn.textContent.includes('Agendar Agora') || btn.textContent.includes('Agendar')) targetElement = btn;
            }

            targetElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openModal();
            });
        });
    }
    attachTriggerButtons();

    // Interceptação global de cliques para garantir que NUNCA saia do modal pop-up
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('a[href*="agendamento"], a[href*="squareup.com"], .lomax-action, .elementor-button-text, .nav-book-btn, [data-action="book-modal"]');
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();
            openModal();
            return;
        }

        // Caso o usuário tenha clicado em um span ou texto que contém "Agendar"
        if (e.target && (e.target.textContent.trim() === 'Agendar Agora' || e.target.textContent.trim() === 'Agendar Este Serviço')) {
            e.preventDefault();
            e.stopPropagation();
            openModal();
        }
    }, true);

    // Se a página carregou com parâmetro ?openBooking=true ou #agendar, abre o modal pop-up direto
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('openBooking') === 'true' || urlParams.get('agendar') === 'true' || window.location.hash === '#agendar') {
            setTimeout(() => {
                openModal();
            }, 300);
        }
    } catch (err) {}

    async function openModal() {
        // Assegura que o barbearia_id e serviços estão carregados com precisão
        if (db) {
            state.barbeariaId = await db.getBarbeariaId();
        }

        // Se o Supabase estiver configurado mas o slug/barbearia não foi encontrada, avisa o usuário
        if (window.supabaseClient && !state.barbeariaId) {
            console.warn('[Modal] Nenhuma barbearia vinculada ao link atual.');
        }

        if (state.barbeariaId && db) {
            const [servs, profs] = await Promise.all([
                db.fetchServicos(state.barbeariaId),
                db.fetchProfissionais(state.barbeariaId)
            ]);
            state.services = (servs && servs.length > 0) ? servs : fallbackServices;
            state.profissionais = (profs && profs.length > 0) ? profs : fallbackStaff.filter(s => s.id !== null);
        } else {
            state.services = fallbackServices;
            state.profissionais = fallbackStaff.filter(s => s.id !== null);
        }

        // Reset state
        state.selectedServices = [];
        state.selectedProfissionalId = null;
        state.selectedProfissionalName = 'Qualquer Barbeiro';
        state.date = null;
        state.dateFormattedYYYYMMDD = null;
        state.selectedDateObj = null;
        state.time = null;
        state.payment = 'presencial';
        state.referenceImageUrl = null;

        if (refPreviewContainer) refPreviewContainer.style.display = 'none';
        if (refFileInput) refFileInput.value = '';

        renderServices();
        goToPhase(1);
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    function goToPhase(phaseNum) {
        [phase1, phase2, phase3, phase4, phase5, phase6].forEach(p => {
            if (p) p.classList.remove('active');
        });

        if (phaseNum === 1) {
            renderServices();
            phase1.classList.add('active');
        }
        if (phaseNum === 2) {
            renderCalendar();
            phase2.classList.add('active');
        }
        if (phaseNum === 3) {
            renderStaffSelector();
            phase3.classList.add('active');
        }
        if (phaseNum === 4) {
            phase4.classList.add('active');
            validateCustomerForm();
        }
        if (phaseNum === 5) {
            renderSummary();
            phase5.classList.add('active');
        }
        if (phaseNum === 6) {
            phase6.classList.add('active');
        }

        // Rola o conteúdo do modal para o topo suavemente
        const contentEl = document.querySelector('.booking-modal-content');
        if (contentEl) contentEl.scrollTop = 0;
    }

    // ── FASE 1: SELEÇÃO DE SERVIÇOS ──
    function renderServices() {
        servicesList.innerHTML = '';
        const listToRender = (state.services && state.services.length > 0) ? state.services : fallbackServices;

        listToRender.forEach(service => {
            const li = document.createElement('li');
            li.className = 'booking-option';
            const isSelected = state.selectedServices.some(s => s.id === service.id || s.nome === service.nome);
            if (isSelected) li.classList.add('selected');

            const dur = service.duracao_minutos || 40;
            const price = typeof service.preco === 'number' ? service.preco : parseFloat(service.preco || 0);

            li.innerHTML = `
                <div class="option-left">
                    <div class="option-checkbox"><i class="fas fa-check"></i></div>
                    <div class="option-info">
                        <span class="option-name">${service.nome}</span>
                        <span class="option-desc">${service.descricao || 'Serviço especializado com produtos premium.'}</span>
                    </div>
                </div>
                <div class="option-meta">
                    <span class="option-price">R$ ${price.toFixed(2).replace('.', ',')}</span>
                    <span class="option-dur">${dur} min</span>
                </div>
            `;

            li.addEventListener('click', () => {
                const idx = state.selectedServices.findIndex(s => s.id === service.id || s.nome === service.nome);
                if (idx > -1) {
                    state.selectedServices.splice(idx, 1);
                    li.classList.remove('selected');
                } else {
                    state.selectedServices.push({
                        id: service.id,
                        servico_id: (service.id && service.id.length > 10) ? service.id : null,
                        nome: service.nome,
                        preco: price,
                        duracao_minutos: dur
                    });
                    li.classList.add('selected');
                }
                btnContinue1.disabled = state.selectedServices.length === 0;
            });

            servicesList.appendChild(li);
        });

        btnContinue1.disabled = state.selectedServices.length === 0;
    }

    btnContinue1.addEventListener('click', () => goToPhase(2));

    // ── FASE 2: DATA & HORÁRIO ──
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    function renderCalendar() {
        const monthYear = document.getElementById('calendar-month');
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';
        timeSlotsList.innerHTML = '<p style="grid-column: 1/-1; font-size:0.85rem; color:#94a3b8; text-align:center; padding:12px 0;">Selecione um dia acima para visualizar os horários disponíveis.</p>';
        btnContinue2.disabled = !state.time;

        const date = new Date(currentYear, currentMonth, 1);
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        monthYear.textContent = `${monthNames[currentMonth]} ${currentYear}`;

        const firstDayIndex = date.getDay();
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < firstDayIndex; i++) {
            const div = document.createElement('div');
            grid.appendChild(div);
        }

        for (let i = 1; i <= lastDay; i++) {
            const div = document.createElement('div');
            div.className = 'calendar-day';
            div.textContent = i;
            
            const cellDate = new Date(currentYear, currentMonth, i);
            
            if (cellDate < today) {
                div.classList.add('disabled');
            } else {
                if (state.selectedDateObj && state.selectedDateObj.getTime() === cellDate.getTime()) {
                    div.classList.add('selected');
                }

                div.addEventListener('click', () => {
                    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
                    div.classList.add('selected');
                    state.date = `${i} de ${monthNames[currentMonth]} de ${currentYear}`;
                    state.selectedDateObj = cellDate;

                    const yyyy = currentYear;
                    const mm = String(currentMonth + 1).padStart(2, '0');
                    const dd = String(i).padStart(2, '0');
                    state.dateFormattedYYYYMMDD = `${yyyy}-${mm}-${dd}`;

                    renderTimeSlots();
                });
            }
            grid.appendChild(div);
        }
    }

    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderCalendar();
    });
    document.getElementById('next-month').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        renderCalendar();
    });

    async function renderTimeSlots() {
        timeSlotsList.innerHTML = '<p style="grid-column:1/-1; font-size:0.85rem; color:#64748b; text-align:center; padding:10px 0;"><i class="fas fa-spinner fa-spin"></i> Verificando disponibilidade...</p>';
        state.time = null;
        btnContinue2.disabled = true;

        if (!state.dateFormattedYYYYMMDD) return;

        let defaultTimes = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
        let occupiedRanges = [];
        let totalActiveStaffCount = (state.profissionais && state.profissionais.length > 0) ? state.profissionais.length : 1;

        if (db && state.barbeariaId) {
            try {
                const dayOfWeek = state.selectedDateObj.getDay();
                const [configuredHours, busyList] = await Promise.all([
                    db.fetchHorariosConfig(state.barbeariaId, dayOfWeek),
                    db.buscarDisponibilidade(state.barbeariaId, state.dateFormattedYYYYMMDD, state.selectedProfissionalId)
                ]);

                if (configuredHours && configuredHours.length > 0) {
                    defaultTimes = configuredHours;
                }
                occupiedRanges = busyList || [];
            } catch (err) {
                console.warn('[Modal] Erro ao buscar horários:', err);
            }
        }

        const now = new Date();
        const isToday = state.selectedDateObj && (state.selectedDateObj.toDateString() === now.toDateString());

        timeSlotsList.innerHTML = '';

        defaultTimes.forEach(t => {
            const div = document.createElement('div');
            div.className = 'time-slot';
            div.textContent = t;

            const [slotH, slotM] = t.split(':').map(Number);
            let isPast = false;
            if (isToday) {
                const slotTimeToday = new Date(now);
                slotTimeToday.setHours(slotH, slotM, 0, 0);
                if (slotTimeToday <= now) {
                    isPast = true;
                }
            }

            let isOccupied = false;
            if (!isPast && occupiedRanges.length > 0) {
                const slotDateTime = new Date(`${state.dateFormattedYYYYMMDD}T${t}:00`);
                
                if (state.selectedProfissionalId) {
                    isOccupied = occupiedRanges.some(item => {
                        const ini = new Date(item.data_hora_inicio || item.inicio);
                        const fim = new Date(item.data_hora_fim || item.fim);
                        return slotDateTime >= ini && slotDateTime < fim;
                    });
                } else {
                    const busyCount = occupiedRanges.filter(item => {
                        const ini = new Date(item.data_hora_inicio || item.inicio);
                        const fim = new Date(item.data_hora_fim || item.fim);
                        return slotDateTime >= ini && slotDateTime < fim;
                    }).length;
                    isOccupied = busyCount >= totalActiveStaffCount;
                }
            }

            if (isPast || isOccupied) {
                div.classList.add('disabled');
                div.title = isPast ? 'Horário já passou' : 'Horário indisponível';
            } else {
                div.addEventListener('click', () => {
                    document.querySelectorAll('.time-slot.selected').forEach(el => el.classList.remove('selected'));
                    div.classList.add('selected');
                    state.time = t;
                    btnContinue2.disabled = false;
                });
            }

            timeSlotsList.appendChild(div);
        });

        if (timeSlotsList.children.length === 0) {
            timeSlotsList.innerHTML = '<p style="grid-column:1/-1; font-size:0.85rem; color:#ef4444; text-align:center; padding:10px 0;">Barbearia fechada neste dia.</p>';
        }
    }

    btnContinue2.addEventListener('click', () => goToPhase(3));
    btnBack2.addEventListener('click', () => goToPhase(1));

    // ── FASE 3: ESCOLHA DO PROFISSIONAL (TELA SEPARADA & DEDICADA) ──
    function renderStaffSelector() {
        if (!staffGrid) return;
        staffGrid.innerHTML = '';

        // 1. Card Qualquer Barbeiro (Auto-atribuição / Atendimento Rápido)
        const anyCard = document.createElement('div');
        anyCard.className = `staff-card-option ${state.selectedProfissionalId === null ? 'selected' : ''}`;
        anyCard.innerHTML = `
            <div class="staff-card-check"><i class="fas fa-check"></i></div>
            <div class="staff-avatar-wrapper">
                <i class="fas fa-cut staff-avatar-fallback-icon"></i>
            </div>
            <span class="staff-card-name">Qualquer Barbeiro</span>
            <span class="staff-card-role">Primeiro disponível</span>
            <span class="staff-badge-tag">Atendimento Rápido</span>
        `;
        anyCard.addEventListener('click', () => {
            state.selectedProfissionalId = null;
            state.selectedProfissionalName = 'Qualquer Barbeiro';
            renderStaffSelector();
        });
        staffGrid.appendChild(anyCard);

        // 2. Cards dos Barbeiros Cadastrados
        const staffList = (state.profissionais && state.profissionais.length > 0) 
            ? state.profissionais 
            : fallbackStaff.filter(s => s.id !== null);

        staffList.forEach(prof => {
            const card = document.createElement('div');
            card.className = `staff-card-option ${state.selectedProfissionalId === prof.id ? 'selected' : ''}`;
            const avatar = prof.avatar_url || 'https://appointments-production-f.squarecdn.com/files/ca72fa4ade643e8d49ecca2d5b4d8f12/original.png';

            card.innerHTML = `
                <div class="staff-card-check"><i class="fas fa-check"></i></div>
                <div class="staff-avatar-wrapper">
                    <img src="${avatar}" class="staff-avatar-img" alt="${prof.nome}" onerror="this.src='../images/LoMax-Barbers.png'" />
                </div>
                <span class="staff-card-name">${prof.nome}</span>
                <span class="staff-card-role">${prof.especialidade || 'Barbeiro Especialista'}</span>
                <span class="staff-badge-tag">Profissional</span>
            `;
            card.addEventListener('click', () => {
                state.selectedProfissionalId = prof.id;
                state.selectedProfissionalName = prof.nome;
                renderStaffSelector();
            });
            staffGrid.appendChild(card);
        });
    }

    btnContinue3.addEventListener('click', () => goToPhase(4));
    btnBack3.addEventListener('click', () => goToPhase(2));

    // ── FASE 4: SEUS DADOS & FOTO DE INSPIRAÇÃO ──
    function validateCustomerForm() {
        const nameInput = document.getElementById('customer-name');
        const phoneInput = document.getElementById('customer-phone');
        const emailInput = document.getElementById('customer-email');

        if (!nameInput || !phoneInput || !emailInput) return;

        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        const email = emailInput.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        const isNameOk = name.length >= 2;
        const isPhoneOk = phone.replace(/\D/g, '').length >= 8;
        const isEmailOk = email.length === 0 || emailRegex.test(email);

        state.customerName = name;
        state.customerPhone = phone;
        state.customerEmail = email;

        const notesInput = document.getElementById('customer-notes');
        if (notesInput) state.notes = notesInput.value.trim();

        btnContinue4.disabled = !(isNameOk && isPhoneOk && isEmailOk);
    }

    document.addEventListener('input', (e) => {
        if (['customer-name', 'customer-phone', 'customer-email', 'customer-notes'].includes(e.target.id)) {
            validateCustomerForm();
        }
    });

    // Upload de foto de referência para o Storage Supabase
    if (refFileInput) {
        refFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const labelEl = document.querySelector('.ref-upload-label span');
            if (labelEl) labelEl.textContent = 'Enviando imagem...';

            try {
                if (db && typeof db.uploadReferencia === 'function') {
                    const uploadedUrl = await db.uploadReferencia(file);
                    if (uploadedUrl) {
                        state.referenceImageUrl = uploadedUrl;
                        refPreviewImg.src = uploadedUrl;
                        refPreviewContainer.style.display = 'flex';
                        if (labelEl) labelEl.textContent = 'Foto anexada com sucesso';
                        return;
                    }
                }

                // Fallback local via FileReader
                const reader = new FileReader();
                reader.onload = function (evt) {
                    state.referenceImageUrl = evt.target.result;
                    refPreviewImg.src = evt.target.result;
                    refPreviewContainer.style.display = 'flex';
                    if (labelEl) labelEl.textContent = 'Foto anexada localmente';
                };
                reader.readAsDataURL(file);

            } catch (err) {
                console.warn('Erro ao processar imagem:', err);
                if (labelEl) labelEl.textContent = 'Anexar foto de referência';
            }
        });
    }

    if (refRemoveBtn) {
        refRemoveBtn.addEventListener('click', () => {
            state.referenceImageUrl = null;
            if (refFileInput) refFileInput.value = '';
            refPreviewContainer.style.display = 'none';
            const labelEl = document.querySelector('.ref-upload-label span');
            if (labelEl) labelEl.textContent = 'Anexar foto de referência';
        });
    }

    btnContinue4.addEventListener('click', () => goToPhase(5));
    btnBack4.addEventListener('click', () => goToPhase(3));

    // ── FASE 5: RESUMO & PAGAMENTO ──
    function renderSummary() {
        const totalDur = state.selectedServices.reduce((acc, s) => acc + (s.duracao_minutos || 40), 0);
        const totalPrice = state.selectedServices.reduce((acc, s) => acc + s.preco, 0);

        const summaryCard = document.getElementById('booking-summary-card');
        if (summaryCard) {
            const servicosText = state.selectedServices.map(s => s.nome).join(', ');

            summaryCard.innerHTML = `
                <div class="summary-row">
                    <span class="summary-label">Serviço(s)</span>
                    <span class="summary-value">${servicosText}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Data & Horário</span>
                    <span class="summary-value">${state.date} às ${state.time}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Profissional</span>
                    <span class="summary-value">${state.selectedProfissionalName}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Cliente</span>
                    <span class="summary-value">${state.customerName} (${state.customerPhone})</span>
                </div>
                <div class="summary-row total-row">
                    <span class="summary-label">Total a Pagar</span>
                    <span class="summary-value">R$ ${totalPrice.toFixed(2).replace('.', ',')} (${totalDur} min)</span>
                </div>
            `;
        }

        renderPaymentOptions();
    }

    function renderPaymentOptions() {
        const grid = document.getElementById('payment-options-grid');
        if (!grid) return;

        const options = [
            { id: 'presencial', label: 'Pagamento no Local', desc: 'Dinheiro, Cartão de Débito ou Crédito' },
            { id: 'pix', label: 'Pagamento via PIX', desc: 'Chave PIX ou QR Code na confirmação' }
        ];

        grid.innerHTML = options.map(opt => `
            <div class="payment-card-option ${state.payment === opt.id ? 'selected' : ''}" data-pay="${opt.id}">
                <div class="payment-radio-circle"></div>
                <div style="display:flex; flex-direction:column; text-align:left;">
                    <span style="font-weight:700; color:#0f172a;">${opt.label}</span>
                    <span style="font-size:0.75rem; color:#64748b;">${opt.desc}</span>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.payment-card-option').forEach(el => {
            el.addEventListener('click', () => {
                state.payment = el.getAttribute('data-pay');
                renderPaymentOptions();
            });
        });
    }

    btnBack5.addEventListener('click', () => goToPhase(4));

    // ── CONFIRMAÇÃO DO AGENDAMENTO (ENVIO SEGURO AO BANCO) ──
    btnConfirm.addEventListener('click', async () => {
        const originalText = btnConfirm.innerHTML;
        btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirmando agendamento...';
        btnConfirm.disabled = true;

        try {
            if (!state.barbeariaId && db) {
                state.barbeariaId = await db.getBarbeariaId();
            }

            // Calcula o timestamp ISO de início
            const [h, m] = (state.time || '09:00').split(':').map(Number);
            const startDateTime = new Date(state.selectedDateObj || new Date());
            startDateTime.setHours(h, m, 0, 0);

            // Monta o payload de serviços JSONB com integridade
            const servicosPayload = state.selectedServices.map(s => ({
                servico_id: s.servico_id || null,
                nome_servico: s.nome,
                preco: Number(s.preco),
                duracao_minutos: Number(s.duracao_minutos || 40)
            }));

            // Imagens de referência se houver
            const imagensPayload = state.referenceImageUrl ? [state.referenceImageUrl] : [];

            // Chama a camada centralizada de dados
            const agendamento = await db.criarAgendamento({
                barbeariaId: state.barbeariaId,
                clienteNome: state.customerName,
                clienteEmail: state.customerEmail || null,
                clienteTelefone: state.customerPhone,
                dataHoraInicioISO: startDateTime.toISOString(),
                servicos: servicosPayload,
                profissionalId: state.selectedProfissionalId,
                formaPagamento: state.payment || 'presencial',
                imagens: imagensPayload,
                observacoes: state.notes,
                canalConfirmacao: 'whatsapp'
            });

            console.log('[Modal] Agendamento confirmado com sucesso:', agendamento);

            // Atualiza tela de sucesso
            const successDetail = document.getElementById('success-booking-detail');
            if (successDetail) {
                successDetail.innerHTML = `
                    <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom:1px solid #e2e8f0; font-size:0.88rem;">
                        <span style="color:#64748b;">Cliente:</span>
                        <strong>${state.customerName}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom:1px solid #e2e8f0; font-size:0.88rem;">
                        <span style="color:#64748b;">Data & Horário:</span>
                        <strong>${state.date} às ${state.time}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom:1px solid #e2e8f0; font-size:0.88rem;">
                        <span style="color:#64748b;">Profissional:</span>
                        <strong>${state.selectedProfissionalName}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding: 6px 0; font-size:0.88rem;">
                        <span style="color:#64748b;">Forma de Pagamento:</span>
                        <strong>${state.payment === 'pix' ? 'PIX' : 'Presencial'}</strong>
                    </div>
                `;
            }

            btnConfirm.innerHTML = originalText;
            goToPhase(6);
            window.dispatchEvent(new CustomEvent('barberBookingConfirmed'));
            return;

        } catch (err) {
            console.error('[Modal] Erro ao criar agendamento:', err);
            btnConfirm.innerHTML = originalText;
            btnConfirm.disabled = false;

            if (err.message && err.message.includes('HORARIO_INDISPONIVEL')) {
                alert('Atenção: Este horário acabou de ser reservado por outro cliente.\n\nPor favor, selecione outro horário disponível na grade.');
                goToPhase(2);
                return;
            }

            alert('Não foi possível concluir o agendamento: ' + (err.message || 'Erro inesperado no servidor.'));
        }
    });

    document.getElementById('btn-close-final').addEventListener('click', closeModal);

    // ── Injeção do DOM do Modal ──
    function createModalDOM() {
        const overlayDiv = document.createElement('div');
        overlayDiv.id = 'booking-modal-overlay';
        overlayDiv.className = 'booking-modal-overlay';

        overlayDiv.innerHTML = `
            <div class="booking-modal">
                <button id="booking-modal-close" class="booking-modal-close" type="button" aria-label="Fechar">✕</button>

                <div class="booking-modal-content">
                    
                    <!-- Fase 1: Serviços -->
                    <div id="phase-1" class="booking-phase active">
                        <h2>Escolha os Serviços</h2>
                        <p class="subtitle">Selecione um ou mais serviços desejados</p>
                        <ul id="services-list" class="booking-options"></ul>
                        <div class="booking-footer">
                            <button id="btn-continue-1" type="button" class="btn-booking btn-black" disabled>Continuar</button>
                        </div>
                    </div>

                    <!-- Fase 2: Data e Horários -->
                    <div id="phase-2" class="booking-phase">
                        <h2>Data e Horário</h2>
                        <p class="subtitle">Escolha o dia e o horário de sua preferência</p>
                        
                        <div class="datetime-container">
                            <div class="calendar-container">
                                <div class="calendar-header">
                                    <button id="prev-month" type="button" aria-label="Mês anterior">‹</button>
                                    <span id="calendar-month"></span>
                                    <button id="next-month" type="button" aria-label="Próximo mês">›</button>
                                </div>
                                <div class="calendar-grid">
                                    <div class="calendar-day-header">Dom</div>
                                    <div class="calendar-day-header">Seg</div>
                                    <div class="calendar-day-header">Ter</div>
                                    <div class="calendar-day-header">Qua</div>
                                    <div class="calendar-day-header">Qui</div>
                                    <div class="calendar-day-header">Sex</div>
                                    <div class="calendar-day-header">Sáb</div>
                                </div>
                                <div id="calendar-grid" class="calendar-grid"></div>
                            </div>

                            <div>
                                <div class="time-slots-section-title">
                                    <i class="far fa-clock"></i> Horários Disponíveis
                                </div>
                                <div id="time-slots" class="time-slots"></div>
                            </div>
                        </div>

                        <div class="booking-footer">
                            <button id="btn-back-2" type="button" class="btn-booking btn-outline">Voltar</button>
                            <button id="btn-continue-2" type="button" class="btn-booking btn-black" disabled>Continuar</button>
                        </div>
                    </div>

                    <!-- Fase 3: Escolha do Profissional (Tela Separada) -->
                    <div id="phase-3" class="booking-phase">
                        <h2>Escolha o Profissional</h2>
                        <p class="subtitle">Selecione o profissional para o seu atendimento</p>
                        
                        <div id="staff-cards-grid" class="staff-cards-grid"></div>

                        <div class="booking-footer">
                            <button id="btn-back-3" type="button" class="btn-booking btn-outline">Voltar</button>
                            <button id="btn-continue-3" type="button" class="btn-booking btn-black">Continuar</button>
                        </div>
                    </div>

                    <!-- Fase 4: Seus Dados & Foto de Inspiração -->
                    <div id="phase-4" class="booking-phase">
                        <h2>Seus Dados</h2>
                        <p class="subtitle">Informe seus contatos para confirmação do agendamento</p>

                        <div class="customer-form">
                            <div class="form-group">
                                <label for="customer-name">Nome completo *</label>
                                <div class="input-wrapper">
                                    <i class="fas fa-user input-icon-svg"></i>
                                    <input type="text" id="customer-name" placeholder="Informe seu nome completo" autocomplete="name" required />
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="customer-phone">Telefone / WhatsApp *</label>
                                <div class="input-wrapper">
                                    <i class="fas fa-phone-alt input-icon-svg"></i>
                                    <input type="tel" id="customer-phone" placeholder="(11) 99999-9999" autocomplete="tel" required />
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="customer-email">E-mail (opcional)</label>
                                <div class="input-wrapper">
                                    <i class="fas fa-envelope input-icon-svg"></i>
                                    <input type="email" id="customer-email" placeholder="seuemail@exemplo.com" autocomplete="email" />
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Foto de referência do corte (opcional)</label>
                                <div class="ref-upload-container">
                                    <label class="ref-upload-label" for="customer-ref-file">
                                        <i class="fas fa-camera"></i>
                                        <span>Anexar foto de referência</span>
                                        <input type="file" id="customer-ref-file" accept="image/*" style="display:none;" />
                                    </label>
                                    <div id="ref-preview-container" class="ref-preview-container" style="display:none;">
                                        <img id="ref-preview-img" class="ref-preview-img" src="" alt="Referência" />
                                        <button id="ref-remove-btn" type="button" class="ref-remove-btn">Remover foto</button>
                                    </div>
                                </div>
                            </div>

                            <div class="form-group">
                                <label for="customer-notes">Observações (opcional)</label>
                                <div class="input-wrapper">
                                    <i class="fas fa-comment-alt input-icon-svg"></i>
                                    <input type="text" id="customer-notes" placeholder="Ex: Corte na tesoura, degradê navalhado" />
                                </div>
                            </div>
                        </div>

                        <div class="booking-footer">
                            <button id="btn-back-4" type="button" class="btn-booking btn-outline">Voltar</button>
                            <button id="btn-continue-4" type="button" class="btn-booking btn-black" disabled>Continuar</button>
                        </div>
                    </div>

                    <!-- Fase 5: Resumo e Pagamento -->
                    <div id="phase-5" class="booking-phase">
                        <h2>Revisão e Pagamento</h2>
                        <p class="subtitle">Confirme os detalhes e a forma de pagamento</p>
                        
                        <div id="booking-summary-card" class="booking-summary-card"></div>

                        <div class="form-group">
                            <label>Forma de Pagamento</label>
                            <div id="payment-options-grid" class="payment-options-grid"></div>
                        </div>

                        <div class="booking-footer">
                            <button id="btn-back-5" type="button" class="btn-booking btn-outline">Voltar</button>
                            <button id="btn-confirm" type="button" class="btn-booking btn-black">Confirmar Agendamento</button>
                        </div>
                    </div>

                    <!-- Fase 6: Confirmação de Sucesso -->
                    <div id="phase-6" class="booking-phase" style="text-align: center; padding: 10px 0;">
                        <div class="success-icon-badge"><i class="fas fa-check"></i></div>
                        <h2>Agendamento Confirmado!</h2>
                        <p class="subtitle">Seu horário foi garantido no sistema com sucesso.</p>
                        <div id="success-booking-detail" class="booking-summary-card"></div>
                        <div class="booking-footer" style="justify-content: center; border-top: none; margin-top: 24px;">
                            <button id="btn-close-final" type="button" class="btn-booking btn-black" style="min-width: 180px;">Concluir</button>
                        </div>
                    </div>

                </div>
            </div>
        `;
        document.body.appendChild(overlayDiv);
    }
});
