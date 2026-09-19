// --- DATA & STATE ---
const db = window.BarberDB;

let barbeariaId = null;
let SERVICES = [
    { id: 's1', nome: 'O Corte de Cabelo', name: 'O Corte de Cabelo', preco: 35, price: 35, duracao_minutos: 40, duration: 40, descricao: 'Uma experiência transformadora moldada às suas características. Inclui consulta personalizada, corte de precisão e finalização manual.' },
    { id: 's2', nome: 'Corte + Sobrancelha', name: 'Corte + Sobrancelha', preco: 50, price: 50, duracao_minutos: 45, duration: 45, descricao: 'Refinamento em cada detalhe. Um corte de precisão finalizado com design profissional de sobrancelha para um perfil impecável.' },
    { id: 's3', nome: 'Corte + Aparagem de Barba', name: 'Corte + Aparagem de Barba', preco: 60, price: 60, duracao_minutos: 50, duration: 50, descricao: 'Nossa transformação mais completa. Um corte detalhado combinado com escultura meticulosa de barba e finalização com toalha quente.' }
];

let STAFF = [
    { id: null, nome: 'Qualquer Barbeiro', name: 'Qualquer Barbeiro', role: 'Primeiro disponível', img: '../images/LoMax-Barbers.png' },
    { id: 'lucas', nome: 'Lucas Silva', name: 'Lucas Silva', role: 'Barbeiro Sênior', img: 'https://appointments-production-f.squarecdn.com/files/ca72fa4ade643e8d49ecca2d5b4d8f12/original.png' },
    { id: 'rafael', nome: 'Rafael Oliveira', name: 'Rafael Oliveira', role: 'Barbeiro Sênior', img: 'https://appointments-production-f.squarecdn.com/files/db51fd462dd6c0bb996237af890dda54/original.png' },
    { id: 'mateus', nome: 'Mateus Santos', name: 'Mateus Santos', role: 'Master Barbeiro', img: 'https://appointments-production-f.squarecdn.com/files/97f9cb2f4d7fc807814997bc6e8aace9/original.png' }
];

let currentStep = 1;
let selectedServices = []; // IDs dos serviços selecionados
let selectedStaff = null; // null = Qualquer Barbeiro
let selectedDate = null;
let selectedTimeSlot = null;
let occupiedRanges = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    if (db) {
        try {
            barbeariaId = await db.getBarbeariaId();
            if (barbeariaId) {
                const [dbServs, dbProfs] = await Promise.all([
                    db.fetchServicos(barbeariaId),
                    db.fetchProfissionais(barbeariaId)
                ]);

                if (dbServs && dbServs.length > 0) {
                    SERVICES = dbServs.map(s => ({
                        id: s.id,
                        nome: s.nome,
                        name: s.nome,
                        preco: Number(s.preco),
                        price: Number(s.preco),
                        duracao_minutos: Number(s.duracao_minutos),
                        duration: Number(s.duracao_minutos),
                        descricao: s.descricao || ''
                    }));
                }

                if (dbProfs && dbProfs.length > 0) {
                    STAFF = [
                        { id: null, nome: 'Qualquer Barbeiro', name: 'Qualquer Barbeiro', role: 'Primeiro disponível', img: '../images/LoMax-Barbers.png' },
                        ...dbProfs.map(p => ({
                            id: p.id,
                            nome: p.nome,
                            name: p.nome,
                            role: p.especialidade || 'Barbeiro',
                            img: p.avatar_url || 'https://appointments-production-f.squarecdn.com/files/ca72fa4ade643e8d49ecca2d5b4d8f12/original.png'
                        }))
                    ];
                }
            }
        } catch (e) {
            console.warn('[Agendamento] Erro ao carregar dados do Supabase:', e);
        }
    }

    renderServices();
    renderStaff();
    generateCalendarTape();
    updateSummary();
}

// --- HELPER DE PREÇO ---
function getServicePriceText(s) {
    const p = s.price || s.preco || 0;
    return `R$ ${p.toFixed(2).replace('.', ',')}`;
}

// --- RENDERING ---
function renderServices() {
    const list = document.getElementById('serviceList');
    if (!list) return;
    list.innerHTML = SERVICES.map(s => {
        const isSelected = selectedServices.includes(s.id);
        return `
            <div class="service-item ${isSelected ? 'selected' : ''}" onclick="toggleService('${s.id}')">
                <div class="service-main">
                    <p class="service-name">${s.nome || s.name}</p>
                    <p class="service-desc">${s.descricao || s.description || ''}</p>
                    <p class="service-meta"><span class="service-price-tag">${getServicePriceText(s)}</span> • ${s.duration || s.duracao_minutos} min</p>
                </div>
                <div class="service-status-area">
                    ${isSelected ? '<span class="added-label"><i class="fas fa-check"></i> Adicionado</span>' : '<span style="color:#000; font-weight:600; font-size:14px;">Adicionar</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function renderStaff() {
    const grid = document.getElementById('staffList');
    if (!grid) return;
    grid.innerHTML = STAFF.map(s => `
        <div class="staff-card ${selectedStaff === s.id ? 'selected' : ''}" onclick="selectStaff(${s.id ? `'${s.id}'` : 'null'})">
            <img src="${s.img}" class="staff-img" onerror="this.src='../images/LoMax-Barbers.png'">
            <p class="staff-name">${s.nome || s.name}</p>
            <p class="staff-role">${s.role}</p>
        </div>
    `).join('');
}

let currentMonthOffset = 0;

function changeMonth(delta) {
    currentMonthOffset += delta;
    if (currentMonthOffset < 0) currentMonthOffset = 0;
    generateCalendarTape();
}

function generateCalendarTape() {
    const tape = document.getElementById('calendarTape');
    const monthDisplay = document.getElementById('monthYearDisplay');
    const dows = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const today = new Date();
    
    const baseDate = new Date();
    baseDate.setMonth(today.getMonth() + currentMonthOffset);
    if (monthDisplay) {
        const monthName = baseDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        monthDisplay.innerText = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }
    
    let html = '';
    const startDay = (currentMonthOffset === 0) ? today.getDate() : 1;
    const daysInMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
    
    for (let day = startDay; day <= Math.min(startDay + 20, daysInMonth); day++) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), day);
        const isSelected = selectedDate && d.toDateString() === selectedDate.toDateString();
        
        html += `
            <div class="tape-day ${isSelected ? 'active' : ''}" 
                 onclick="selectDate(${d.getTime()})">
                <span class="tape-dow">${dows[d.getDay()]}</span>
                <span class="tape-dom">${d.getDate()}</span>
            </div>
        `;
    }
    tape.innerHTML = html;
}

async function renderTimeSlots() {
    const morningContainer = document.getElementById('morningSlots');
    const afternoonContainer = document.getElementById('afternoonSlots');
    const eveningContainer = document.getElementById('eveningSlots');

    if (!selectedDate) {
        if (morningContainer) morningContainer.innerHTML = '<span style="color:#aaa; font-size:13px;">Selecione um dia</span>';
        if (afternoonContainer) afternoonContainer.innerHTML = '<span style="color:#aaa; font-size:13px;">Selecione um dia</span>';
        if (eveningContainer) eveningContainer.innerHTML = '<span style="color:#aaa; font-size:13px;">Selecione um dia</span>';
        return;
    }

    if (morningContainer) morningContainer.innerHTML = 'Verificando...';
    if (afternoonContainer) afternoonContainer.innerHTML = 'Verificando...';
    if (eveningContainer) eveningContainer.innerHTML = 'Verificando...';

    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    const dateFormatted = `${yyyy}-${mm}-${dd}`;

    // Busca disponibilidade no Supabase
    if (db && barbeariaId) {
        try {
            occupiedRanges = await db.buscarDisponibilidade(barbeariaId, dateFormatted, selectedStaff);
        } catch (e) {
            console.warn('Erro ao checar disponibilidade:', e);
            occupiedRanges = [];
        }
    }

    const morningTimes = ['09:00', '09:45', '10:30', '11:15'];
    const afternoonTimes = ['13:00', '13:45', '14:30', '15:15', '16:00', '16:45', '17:30'];
    const eveningTimes = ['18:15', '19:00'];

    const renderSlotsGroup = (times, container) => {
        if (!container) return;
        const now = new Date();
        const isToday = selectedDate.toDateString() === now.toDateString();
        const realStaffCount = STAFF.filter(s => s.id !== null).length || 1;

        const html = times.map(t => {
            const [h, m] = t.split(':').map(Number);
            let isPast = false;
            if (isToday) {
                const slotD = new Date(now);
                slotD.setHours(h, m, 0, 0);
                if (slotD <= now) isPast = true;
            }

            let isOccupied = false;
            if (!isPast && occupiedRanges && occupiedRanges.length > 0) {
                const slotTime = new Date(`${dateFormatted}T${t}:00`);
                if (selectedStaff) {
                    isOccupied = occupiedRanges.some(item => {
                        const ini = new Date(item.data_hora_inicio || item.inicio);
                        const fim = new Date(item.data_hora_fim || item.fim);
                        return slotTime >= ini && slotTime < fim;
                    });
                } else {
                    const busyCount = occupiedRanges.filter(item => {
                        const ini = new Date(item.data_hora_inicio || item.inicio);
                        const fim = new Date(item.data_hora_fim || item.fim);
                        return slotTime >= ini && slotTime < fim;
                    }).length;
                    isOccupied = busyCount >= realStaffCount;
                }
            }

            const isDisabled = isPast || isOccupied;
            const isSelected = selectedTimeSlot === t;

            if (isDisabled) {
                return `<button class="slot-pill disabled" style="opacity:0.4; text-decoration:line-through; cursor:not-allowed;" disabled title="${isPast ? 'Horário já passou' : 'Indisponível'}">${t}</button>`;
            }

            return `<button class="slot-pill ${isSelected ? 'active' : ''}" onclick="selectTime('${t}')">${t}</button>`;
        }).join('');

        container.innerHTML = html || 'Indisponível';
    };

    renderSlotsGroup(morningTimes, morningContainer);
    renderSlotsGroup(afternoonTimes, afternoonContainer);
    renderSlotsGroup(eveningTimes, eveningContainer);
}

// --- ACTIONS ---
function toggleService(id) {
    const index = selectedServices.indexOf(id);
    if (index > -1) {
        selectedServices.splice(index, 1);
    } else {
        selectedServices.push(id);
    }
    renderServices();
    updateSummary();
}

function selectStaff(id) {
    selectedStaff = id;
    renderStaff();
    if (selectedDate) renderTimeSlots();
    updateSummary();
}

function selectDate(ts) {
    selectedDate = new Date(ts);
    generateCalendarTape();
    renderTimeSlots();
    updateSummary();
}

function selectTime(t) {
    selectedTimeSlot = t;
    renderTimeSlots();
    updateSummary();
}

// --- SUMMARY LOGIC ---
function updateSummary() {
    const tree = document.getElementById('summaryTree');
    const countText = document.getElementById('serviceCountText');
    const totalText = document.getElementById('totalAndDurationText');
    const avatarStack = document.getElementById('avatarStack');
    
    if (countText) countText.innerText = `${selectedServices.length} serviço(s) selecionado(s)`;
    
    let total = 0;
    let duration = 0;
    
    if (tree) {
        tree.innerHTML = selectedServices.map(id => {
            const s = SERVICES.find(sv => sv.id === id);
            if (!s) return '';
            const price = s.price || s.preco || 0;
            const dur = s.duration || s.duracao_minutos || 40;
            total += price;
            duration += dur;
            
            const staffObj = STAFF.find(st => st.id === selectedStaff);
            const staffName = staffObj ? (staffObj.id ? 'com ' + staffObj.name : 'Qualquer Barbeiro') : 'Qualquer Barbeiro';

            return `
                <div class="tree-node">
                    <div class="node-content">
                        <div class="node-main">
                            <span class="node-service">${s.nome || s.name}</span>
                            <span class="node-staff">${staffName}</span>
                        </div>
                        <span class="node-price">R$ ${price.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (totalText) totalText.innerText = `R$ ${total.toFixed(2).replace('.', ',')} • ${duration} min`;

    // Avatars
    if (avatarStack) {
        const sObj = STAFF.find(s => s.id === selectedStaff);
        if (sObj && sObj.id) {
            avatarStack.innerHTML = `<img src="${sObj.img}" class="staff-img" style="width:40px; height:40px; margin:0">`;
        } else {
            avatarStack.innerHTML = `<img src="../images/LoMax-Barbers.png" style="width:40px; height:40px; opacity:0.8;">`;
        }
    }

    // Date/Time Display
    if (selectedDate && selectedTimeSlot) {
        const footerDate = document.getElementById('summaryFooterDate');
        if (footerDate) footerDate.style.display = 'flex';
        const finalDateStr = document.getElementById('finalDateStr');
        if (finalDateStr) finalDateStr.innerText = selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        const finalTimeRange = document.getElementById('finalTimeRange');
        if (finalTimeRange) finalTimeRange.innerText = `${selectedTimeSlot} - ${calculateEndTime(selectedTimeSlot, duration)}`;
    }

    // Button states
    const btn = document.getElementById('mainActionBtn');
    if (btn) {
        if (currentStep === 1) {
            btn.innerText = 'Avançar';
            btn.disabled = selectedServices.length === 0;
        } else if (currentStep === 2) {
            btn.innerText = 'Avançar';
            btn.disabled = false; // Barbeiro selecionado ou Qualquer Barbeiro
        } else if (currentStep === 3) {
            btn.innerText = 'Avançar';
            btn.disabled = !selectedTimeSlot;
        } else if (currentStep === 4) {
            btn.innerText = 'Confirmar Agendamento';
            btn.disabled = !isStep4FormValid();
        }
    }
}

function isStep4FormValid() {
    const firstName = document.getElementById('clientFirstName')?.value.trim() || '';
    const phone = document.getElementById('clientPhone')?.value.trim() || '';
    const email = document.getElementById('clientEmail')?.value.trim() || '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const isNameOk = firstName.length >= 2;
    const isPhoneOk = phone.replace(/\D/g, '').length >= 8;
    const isEmailOk = email.length === 0 || emailRegex.test(email);

    return isNameOk && isPhoneOk && isEmailOk;
}

// Monitora digitação nos campos do Step 4 para habilitar o botão de confirmar apenas quando preenchido
document.addEventListener('input', (e) => {
    if (['clientFirstName', 'clientLastName', 'clientPhone', 'clientEmail'].includes(e.target.id)) {
        const btn = document.getElementById('mainActionBtn');
        if (btn && currentStep === 4) {
            btn.disabled = !isStep4FormValid();
        }
    }
});

function calculateEndTime(start, durTotal) {
    if (!start) return '';
    let [h, m] = start.split(':').map(Number);
    m += (durTotal || 40);
    h += Math.floor(m / 60);
    m = m % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// --- TIMER REGRESSIVO ---
let timerInterval = null;
function startHoldTimer() {
    let timeLeft = 600; // 10 minutos
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerEl.innerText = "00:00";
            return;
        }
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        timerEl.innerText = `${m}:${s}`;
    }, 1000);
}

// --- NAVIGATION ---
function nextStep() {
    if (currentStep === 1 && selectedServices.length === 0) {
        alert('Por favor, selecione pelo menos um serviço antes de avançar.');
        return;
    }
    if (currentStep === 3 && !selectedTimeSlot) {
        alert('Por favor, selecione um horário antes de avançar.');
        return;
    }

    if (currentStep >= 4) {
        if (!isStep4FormValid()) {
            alert('Por favor, preencha seu Nome e Telefone/WhatsApp antes de confirmar.');
            return;
        }
        finish();
        return;
    }
    
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep++;
    document.getElementById(`step${currentStep}`).classList.add('active');
    
    if (currentStep === 4) {
        startHoldTimer();
    }
    
    updateSummary();
}

async function finish() {
    const firstName = document.getElementById('clientFirstName')?.value.trim() || '';
    const lastName = document.getElementById('clientLastName')?.value.trim() || '';
    const phone = document.getElementById('clientPhone')?.value.trim() || '';
    const email = document.getElementById('clientEmail')?.value.trim() || '';
    const refLink = document.getElementById('imageReference')?.value.trim() || '';
    const refFileInput = document.getElementById('clientRefFile');
    const paymentRadio = document.querySelector('input[name="paymentType"]:checked');
    const formaPagamento = paymentRadio ? paymentRadio.value : 'presencial';

    if (!firstName || firstName.length < 2) {
        alert('Por favor, informe seu Nome.');
        const input = document.getElementById('clientFirstName');
        if (input) input.focus();
        return;
    }

    if (!phone || phone.replace(/\D/g, '').length < 8) {
        alert('Por favor, informe um número de Telefone / WhatsApp válido com DDD.');
        const input = document.getElementById('clientPhone');
        if (input) input.focus();
        return;
    }

    if (!selectedDate || !selectedTimeSlot) {
        alert('Por favor, selecione uma data e horário válidos antes de confirmar.');
        return;
    }

    const fullName = `${firstName} ${lastName}`.trim();

    const btn = document.getElementById('mainActionBtn');
    const origText = btn.innerText;
    btn.innerText = 'Confirmando no banco...';
    btn.disabled = true;

    try {
        let referenceUrl = refLink;
        if (refFileInput && refFileInput.files && refFileInput.files[0] && db) {
            try {
                const uploadedUrl = await db.uploadReferencia(refFileInput.files[0]);
                if (uploadedUrl) referenceUrl = uploadedUrl;
            } catch (upErr) {
                console.warn('Falha no upload de imagem:', upErr);
            }
        }

        // Calcula timestamp ISO de início
        const [h, m] = selectedTimeSlot.split(':').map(Number);
        const startDateTime = new Date(selectedDate);
        startDateTime.setHours(h, m, 0, 0);

        const servicosPayload = selectedServices.map(id => {
            const s = SERVICES.find(sv => sv.id === id);
            return {
                servico_id: (s.id && s.id.length > 10) ? s.id : null,
                nome_servico: s.nome || s.name,
                preco: Number(s.price || s.preco),
                duracao_minutos: Number(s.duration || s.duracao_minutos || 40)
            };
        });

        if (db) {
            if (!barbeariaId) barbeariaId = await db.getBarbeariaId();
            
            if (!barbeariaId) {
                throw new Error('Identificação da barbearia não encontrada. Por favor, recarregue a página.');
            }

            console.log('[Agendamento] Enviando para barbearia ID:', barbeariaId);

            await db.criarAgendamento({
                barbeariaId: barbeariaId,
                clienteNome: fullName,
                clienteEmail: email || null,
                clienteTelefone: phone,
                dataHoraInicioISO: startDateTime.toISOString(),
                servicos: servicosPayload,
                profissionalId: selectedStaff || null,
                formaPagamento: formaPagamento, // 'pix' ou 'presencial'
                imagens: referenceUrl ? [referenceUrl] : [],
                observacoes: '',
                canalConfirmacao: 'whatsapp'
            });
        }

        // Exibe diretamente o card de sucesso na tela (Step 5)
        const staffObj = STAFF.find(st => st.id === selectedStaff);
        const staffName = staffObj ? (staffObj.nome || staffObj.name) : 'Qualquer Barbeiro';
        const cardEl = document.getElementById('bookingSuccessCard');
        if (cardEl) {
            const servicosNomes = selectedServices.map(id => {
                const sv = SERVICES.find(s => s.id === id);
                return sv ? (sv.nome || sv.name) : '';
            }).filter(Boolean).join(', ');

            cardEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px;">
                    <span style="color: #64748b; font-size: 0.85rem;">Cliente:</span>
                    <strong style="color: #0f172a; font-size: 0.85rem;">${fullName}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px;">
                    <span style="color: #64748b; font-size: 0.85rem;">Data & Horário:</span>
                    <strong style="color: #0f172a; font-size: 0.85rem;">${selectedDate.toLocaleDateString('pt-BR')} às ${selectedTimeSlot}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px;">
                    <span style="color: #64748b; font-size: 0.85rem;">Profissional:</span>
                    <strong style="color: #0f172a; font-size: 0.85rem;">${staffName}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px;">
                    <span style="color: #64748b; font-size: 0.85rem;">Serviço(s):</span>
                    <strong style="color: #0f172a; font-size: 0.85rem;">${servicosNomes}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #64748b; font-size: 0.85rem;">Pagamento:</span>
                    <strong style="color: #0f172a; font-size: 0.85rem;">${formaPagamento === 'pix' ? 'PIX' : 'Presencial'}</strong>
                </div>
            `;
        }

        // Esconde os steps anteriores e mostra o card de confirmação
        for (let i = 1; i <= 4; i++) {
            const st = document.getElementById(`step${i}`);
            if (st) st.classList.remove('active');
        }
        const step5 = document.getElementById('step5');
        if (step5) step5.classList.add('active');

        // Esconde a barra lateral de resumo
        const sidebar = document.querySelector('.app-sidebar');
        if (sidebar) sidebar.style.display = 'none';

        const mobileFooter = document.querySelector('.app-footer-nav');
        if (mobileFooter) mobileFooter.style.display = 'none';
        
        btn.innerText = origText;
        btn.disabled = false;
        return;
    } catch (err) {
        console.error('Erro ao agendar:', err);
        btn.innerText = origText;
        btn.disabled = false;

        if (err.message && err.message.includes('HORARIO_INDISPONIVEL')) {
            alert('⚠️ Ops! Este horário acabou de ser reservado por outro cliente.\n\nPor favor, retorne e selecione outro horário.');
            document.getElementById(`step${currentStep}`).classList.remove('active');
            currentStep = 3;
            document.getElementById(`step${currentStep}`).classList.add('active');
            renderTimeSlots();
            updateSummary();
            return;
        }

        alert('Erro ao salvar agendamento: ' + (err.message || 'Falha de conexão.'));
    }
}
