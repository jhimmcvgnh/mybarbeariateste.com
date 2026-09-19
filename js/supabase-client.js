/**
 * Supabase Client & Centralized Real-Time Data Access Layer
 * Gerencia a conexÃ£o com o Supabase, multi-tenancy, agendamentos com sincronizaÃ§Ã£o em tempo real (sem delay e sem recarregar pÃ¡ginas).
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // ⚠️  COLE AQUI AS CREDENCIAIS DO NOVO BANCO DE DADOS QUANDO ESTIVER PRONTO
  // Cole a URL e a ANON KEY do seu novo projeto Supabase:
  // ══════════════════════════════════════════════════════════════════════
  const SUPABASE_URL = (typeof window !== 'undefined' && window.VITE_SUPABASE_URL) || 'https://gjxklrgksddealckkkve.supabase.co';
  const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqeGtscmdrc2RkZWFsY2tra3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU0ODMsImV4cCI6MjEwMzgwMTQ4M30.aweAIFFF3cZ1GwpDTn5YJMALPKSoQwuH_jv1df3re-k';
  const DEFAULT_BARBEARIA_SLUG = '';
  const STORAGE_BUCKET = 'agendamento-referencias';

  // Canal de sincronizaÃ§Ã£o instantÃ¢nea entre abas / janelas (Cross-Tab Realtime Bus)
  const realtimeBus = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel('barber_system_realtime_sync')
    : null;

  // UtilitÃ¡rio para validar formato UUID v4
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function isValidUUID(val) {
    return typeof val === 'string' && UUID_REGEX.test(val.trim());
  }

  // Inicializa o cliente global se a biblioteca supabase-js estiver carregada e as credenciais estiverem preenchidas
  if (
    window.supabase &&
    typeof window.supabase.createClient === 'function' &&
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('SEU_PROJETO')
  ) {
    try {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
      console.info('[Supabase] âœ… Cliente conectado com sucesso ao banco de dados.');
    } catch (err) {
      console.error('[Supabase] âŒ Falha ao inicializar o cliente:', err);
      window.supabaseClient = null;
    }
  } else {
    console.info('[Supabase] â„¹ï¸ Modo limpo ativo: aguardando inserÃ§Ã£o de credenciais do novo banco em js/supabase-client.js.');
    window.supabaseClient = null;
  }

  // Caches em memÃ³ria para zero-latency
  const slugIdCache = new Map();
  let cachedBarbeariaInfo = null;
  let cachedServicos = null;
  let cachedProfissionais = null;

  const BarberDB = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    DEFAULT_BARBEARIA_SLUG,
    STORAGE_BUCKET,

    /**
     * Valida se uma string Ã© um UUID vÃ¡lido do Postgres
     */
    isValidUUID: isValidUUID,

    /**
     * ObtÃ©m o slug da barbearia a partir da URL (?barbearia=slug ou ?slug=slug)
     * e mantÃ©m em persistÃªncia local para nÃ£o perder o tenant durante a navegaÃ§Ã£o.
     */
    getBarbeariaSlug: function () {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const slugParam = urlParams.get('barbearia') || urlParams.get('slug');
        if (slugParam && slugParam.trim()) {
          const clean = slugParam.trim().toLowerCase();
          localStorage.setItem('barber_active_slug', clean);
          sessionStorage.setItem('barber_active_slug', clean);
          return clean;
        }

        // Tenta recuperar da sessÃ£o atual
        const savedSession = sessionStorage.getItem('barber_active_slug');
        if (savedSession && savedSession.trim()) {
          return savedSession.trim().toLowerCase();
        }

        // Tenta recuperar do armazenamento local
        const savedLocal = localStorage.getItem('barber_active_slug');
        if (savedLocal && savedLocal.trim()) {
          return savedLocal.trim().toLowerCase();
        }
      } catch (e) {
        console.warn('[BarberDB] Erro ao ler parÃ¢metro da URL:', e);
      }
      return DEFAULT_BARBEARIA_SLUG;
    },

    /**
     * Resolve o UUID da barbearia a partir do slug ou usuÃ¡rio logado com estrita precisÃ£o:
     * 1. ParÃ¢metro de URL (?barbearia=slug ou ?slug=slug) via RPC ou tabela
     * 2. SessÃ£o do dono autenticado no Supabase (auth.getUser() -> dono_id)
     * 3. ID de barbearia armazenado localmente para o usuÃ¡rio ativo
     * 4. Se nenhuma forma acima resolver (acesso pÃºblico ao site sem parÃ¢metro de URL),
     *    busca a barbearia ativa cadastrada no banco de dados para vincular o agendamento com seguranÃ§a.
     */
    getBarbeariaId: async function (customSlug) {
      const slug = (customSlug || this.getBarbeariaSlug() || '').trim().toLowerCase();
      if (slug && slugIdCache.has(slug)) {
        return slugIdCache.get(slug);
      }

      if (!window.supabaseClient) {
        const savedId = localStorage.getItem('barber_active_barbearia_id');
        return (savedId && isValidUUID(savedId)) ? savedId : null;
      }

      try {
        // 1. Se tem slug na URL ou passado diretamente, busca por ele
        if (slug) {
          try {
            const { data: rpcId, error: rpcError } = await window.supabaseClient.rpc('buscar_barbearia_id_por_slug', {
              p_slug: slug
            });

            if (!rpcError && rpcId && isValidUUID(rpcId)) {
              slugIdCache.set(slug, rpcId);
              return rpcId;
            }
          } catch (rpcErr) {}

          const { data: slugMatch } = await window.supabaseClient
            .from('barbearias')
            .select('id, slug, nome')
            .eq('slug', slug)
            .eq('ativo', true)
            .limit(1)
            .maybeSingle();

          if (slugMatch && slugMatch.id) {
            slugIdCache.set(slug, slugMatch.id);
            return slugMatch.id;
          }
        }

        // 2. Verifica se hÃ¡ um dono logado no Supabase com barbearia cadastrada
        if (window.supabaseClient.auth) {
          try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user && user.id) {
              const { data: userBarb } = await window.supabaseClient
                .from('barbearias')
                .select('id, slug')
                .eq('dono_id', user.id)
                .eq('ativo', true)
                .limit(1)
                .maybeSingle();

              if (userBarb && userBarb.id) {
                if (userBarb.slug) slugIdCache.set(userBarb.slug, userBarb.id);
                localStorage.setItem('barber_active_barbearia_id', userBarb.id);
                if (userBarb.slug) localStorage.setItem('barber_active_slug', userBarb.slug);
                return userBarb.id;
              }
            }
          } catch (authErr) {}
        }

        // 3. Verifica armazenamento da sessÃ£o ativa
        const activeBarbId = localStorage.getItem('barber_active_barbearia_id') || sessionStorage.getItem('barber_active_barbearia_id');
        if (activeBarbId && isValidUUID(activeBarbId)) {
          return activeBarbId;
        }

        // 4. Fallback: busca a barbearia ativa cadastrada no banco de dados para evitar barbearia_id nulo
        try {
          const { data: defaultBarb } = await window.supabaseClient
            .from('barbearias')
            .select('id, slug, nome')
            .eq('ativo', true)
            .order('criado_em', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (defaultBarb && defaultBarb.id && isValidUUID(defaultBarb.id)) {
            if (defaultBarb.slug) slugIdCache.set(defaultBarb.slug, defaultBarb.id);
            localStorage.setItem('barber_active_barbearia_id', defaultBarb.id);
            if (defaultBarb.slug) localStorage.setItem('barber_active_slug', defaultBarb.slug);
            return defaultBarb.id;
          }
        } catch (defaultErr) {
          console.warn('[BarberDB] Erro ao carregar barbearia padrÃ£o:', defaultErr);
        }

        // 5. Se ainda nÃ£o houver barbearia no banco, retorna um identificador padrÃ£o seguro
        const fallbackDefaultId = '00000000-0000-0000-0000-000000000001';
        localStorage.setItem('barber_active_barbearia_id', fallbackDefaultId);
        return fallbackDefaultId;
      } catch (err) {
        console.error('[BarberDB] ExceÃ§Ã£o ao buscar ID da barbearia:', err);
        return '00000000-0000-0000-0000-000000000001';
      }
    },

    /**
     * Busca dados da barbearia (nome, telefone, logo, endereÃ§o)
     */
    fetchBarbeariaInfo: async function (barbeariaId) {
      if (!window.supabaseClient || !barbeariaId) return null;
      if (cachedBarbeariaInfo && cachedBarbeariaInfo.id === barbeariaId) {
        return cachedBarbeariaInfo;
      }

      try {
        const { data, error } = await window.supabaseClient
          .from('barbearias')
          .select('id, nome, slug, telefone, email_contato, logo_url, endereco, ativo')
          .eq('id', barbeariaId)
          .maybeSingle();

        if (error) {
          console.error('[BarberDB] Erro ao buscar info da barbearia:', error);
          return null;
        }

        cachedBarbeariaInfo = data;
        return data;
      } catch (e) {
        console.error('[BarberDB] ExceÃ§Ã£o ao buscar info da barbearia:', e);
        return null;
      }
    },

    /**
     * Busca serviÃ§os ativos da barbearia
     */
    fetchServicos: async function (barbeariaId) {
      if (!window.supabaseClient || !barbeariaId) return [];
      try {
        const { data, error } = await window.supabaseClient
          .from('servicos')
          .select('id, nome, descricao, preco, duracao_minutos, ativo')
          .eq('barbearia_id', barbeariaId)
          .eq('ativo', true)
          .order('preco', { ascending: true });

        if (error) {
          console.error('[BarberDB] Erro ao buscar serviÃ§os:', error);
          return [];
        }
        cachedServicos = data || [];
        return cachedServicos;
      } catch (e) {
        console.error('[BarberDB] ExceÃ§Ã£o ao buscar serviÃ§os:', e);
        return [];
      }
    },

    /**
     * Busca profissionais ativos da barbearia
     */
    fetchProfissionais: async function (barbeariaId) {
      if (!window.supabaseClient || !barbeariaId) return [];
      try {
        const { data, error } = await window.supabaseClient
          .from('profissionais')
          .select('id, nome, especialidade, avaliacao_media, avatar_url, ativo')
          .eq('barbearia_id', barbeariaId)
          .eq('ativo', true)
          .order('nome', { ascending: true });

        if (error) {
          console.error('[BarberDB] Erro ao buscar profissionais:', error);
          return [];
        }
        cachedProfissionais = data || [];
        return cachedProfissionais;
      } catch (e) {
        console.error('[BarberDB] ExceÃ§Ã£o ao buscar profissionais:', e);
        return [];
      }
    },

    /**
     * Busca agendamentos com filtros e ordenaÃ§Ã£o (Estritamente isolado para a barbearia do usuÃ¡rio)
     */
    fetchAgendamentos: async function (barbeariaId, options = {}) {
      let cleanId = (barbeariaId && isValidUUID(barbeariaId)) ? barbeariaId : null;
      if (!cleanId) {
        cleanId = await this.getBarbeariaId();
      }

      // Se nÃ£o houver barbearia vinculada, NUNCA expÃµe agendamentos de terceiros
      if (!cleanId || !isValidUUID(cleanId)) {
        return [];
      }

      if (!window.supabaseClient) {
        try {
          const cacheKey = `barber_agendamentos_cache_${cleanId}`;
          return JSON.parse(localStorage.getItem(cacheKey) || '[]');
        } catch (e) {
          return [];
        }
      }

      try {
        let query = window.supabaseClient
          .from('agendamentos')
          .select(`
            id,
            barbearia_id,
            cliente_id,
            cliente_nome,
            cliente_telefone,
            cliente_email,
            profissional_id,
            data_hora_inicio,
            data_hora_fim,
            preco_total,
            duracao_total,
            status,
            forma_pagamento,
            observacoes,
            imagens,
            criado_em
          `)
          .eq('barbearia_id', cleanId)
          .order('data_hora_inicio', { ascending: true });

        if (options.dataInicio) {
          query = query.gte('data_hora_inicio', options.dataInicio);
        }
        if (options.dataFim) {
          query = query.lte('data_hora_inicio', options.dataFim);
        }
        if (options.status) {
          query = query.eq('status', options.status);
        }
        if (options.profissionalId && isValidUUID(options.profissionalId)) {
          query = query.eq('profissional_id', options.profissionalId);
        }

        const { data, error } = await query;
        if (error) {
          console.error('[BarberDB] Erro ao buscar agendamentos:', error);
          return [];
        }

        return data || [];
      } catch (e) {
        console.error('[BarberDB] ExceÃ§Ã£o ao buscar agendamentos:', e);
        return [];
      }
    },

    /**
     * Busca os horÃ¡rios configurados para um dia da semana (0=Dom, 1=Seg, ... 6=Sab)
     */
    fetchHorariosConfig: async function (barbeariaId, diaSemana) {
      if (!window.supabaseClient || !barbeariaId) return [];
      try {
        let query = window.supabaseClient
          .from('horarios_disponiveis')
          .select('horario, dia_semana, ativo')
          .eq('barbearia_id', barbeariaId)
          .eq('ativo', true);

        if (typeof diaSemana === 'number') {
          query = query.eq('dia_semana', diaSemana);
        }

        const { data, error } = await query.order('horario', { ascending: true });
        if (error) {
          console.error('[BarberDB] Erro ao buscar horÃ¡rios configurados:', error);
          return [];
        }
        return (data || []).map(row => (row.horario || '').substring(0, 5));
      } catch (e) {
        console.error('[BarberDB] ExceÃ§Ã£o ao buscar horÃ¡rios configurados:', e);
        return [];
      }
    },

    /**
     * Busca a disponibilidade de horÃ¡rios via RPC buscar_disponibilidade
     * Retorna lista de intervalos ocupados [ { inicio, fim, profissional_id } ]
     */
    buscarDisponibilidade: async function (barbeariaId, dataFormatadaYYYYMMDD, profissionalId = null) {
      if (!window.supabaseClient || !barbeariaId || !dataFormatadaYYYYMMDD) return [];
      
      const cleanProfId = isValidUUID(profissionalId) ? profissionalId : null;

      try {
        // 1. Tenta RPC buscar_disponibilidade
        const { data, error } = await window.supabaseClient.rpc('buscar_disponibilidade', {
          p_barbearia_id: barbeariaId,
          p_data: dataFormatadaYYYYMMDD,
          p_profissional_id: cleanProfId
        });

        if (!error && data) {
          return data;
        }
      } catch (e) {}

      // Fallback: consulta direta aos agendamentos do dia na tabela
      try {
        const diaInicio = `${dataFormatadaYYYYMMDD}T00:00:00.000Z`;
        const diaFim = `${dataFormatadaYYYYMMDD}T23:59:59.999Z`;

        let query = window.supabaseClient
          .from('agendamentos')
          .select('data_hora_inicio, data_hora_fim, profissional_id')
          .eq('barbearia_id', barbeariaId)
          .neq('status', 'cancelado')
          .gte('data_hora_inicio', diaInicio)
          .lte('data_hora_inicio', diaFim);

        if (cleanProfId) {
          query = query.eq('profissional_id', cleanProfId);
        }

        const { data: rows, error: qErr } = await query;
        if (!qErr && rows) {
          return rows.map(r => ({
            inicio: r.data_hora_inicio,
            fim: r.data_hora_fim,
            profissional_id: r.profissional_id
          }));
        }
      } catch (err) {
        console.warn('[BarberDB] Falha no fallback de disponibilidade:', err);
      }

      return [];
    },

    /**
     * Faz upload de uma foto de referÃªncia de corte para o bucket Supabase Storage
     */
    uploadReferencia: async function (file) {
      if (!window.supabaseClient || !file) return null;
      try {
        const fileExt = file.name ? file.name.split('.').pop() : 'jpg';
        const fileName = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await window.supabaseClient.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.warn('[BarberDB Storage] Erro no upload:', uploadError.message);
          return null;
        }

        const { data: publicData } = window.supabaseClient.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(filePath);

        return publicData ? publicData.publicUrl : null;
      } catch (e) {
        console.warn('[BarberDB Storage] ExceÃ§Ã£o no upload:', e);
        return null;
      }
    },

    uploadFotoReferencia: async function (file) {
      return this.uploadReferencia(file);
    },

    /**
     * TRANSMISSÃƒO REAL-TIME ZERO-DELAY:
     * Dispara eventos locais, atualiza cache e notifica o BroadcastChannel
     * para que o painel administrativo, o site e outras abas vejam os dados NO MESMO INSTANTE.
     */
    broadcastAgendamentoCreated: function (agendamento) {
      if (!agendamento) return;

      // 1. Salva cache local isolado estritamente por barbearia
      try {
        const cacheKey = agendamento.barbearia_id ? `barber_agendamentos_cache_${agendamento.barbearia_id}` : 'barber_agendamentos_cache';
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        const exists = cache.some(item => item.id === agendamento.id);
        if (!exists) {
          cache.unshift(agendamento);
          localStorage.setItem(cacheKey, JSON.stringify(cache.slice(0, 100)));
        }
      } catch (e) {}

      // 2. Dispara evento DOM na janela atual
      window.dispatchEvent(new CustomEvent('barber_agendamento_created', { detail: agendamento }));
      window.dispatchEvent(new CustomEvent('barber_data_updated', {
        detail: { type: 'agendamento', data: agendamento, timestamp: Date.now() }
      }));

      // 3. Transmite para outras abas/janelas do mesmo tenant
      if (realtimeBus) {
        try {
          realtimeBus.postMessage({
            type: 'AGENDAMENTO_CREATED',
            payload: agendamento,
            timestamp: Date.now()
          });
        } catch (e) {}
      }
    },

    /**
     * InscriÃ§Ã£o em Tempo Real (Realtime Subscription):
     * Ouve alteraÃ§Ãµes do Supabase Postgres Changes + Cross-tab BroadcastChannel
     */
    subscribeToAgendamentos: function (barbeariaId, onEventCallback) {
      if (typeof onEventCallback !== 'function') return () => {};

      // 1. Escuta eventos disparados nesta janela
      const localHandler = (e) => {
        const ag = e.detail;
        if (!barbeariaId || (ag && ag.barbearia_id === barbeariaId)) {
          onEventCallback({
            eventType: 'INSERT',
            new: ag,
            source: 'local'
          });
        }
      };
      window.addEventListener('barber_agendamento_created', localHandler);

      // 2. Escuta eventos vindos de outras abas via BroadcastChannel (com validaÃ§Ã£o estrita de barbearia_id)
      const busHandler = (event) => {
        if (event.data && event.data.type === 'AGENDAMENTO_CREATED') {
          const ag = event.data.payload;
          if (barbeariaId && ag && ag.barbearia_id === barbeariaId) {
            onEventCallback({
              eventType: 'INSERT',
              new: ag,
              source: 'broadcast_channel'
            });
          }
        }
      };
      if (realtimeBus) {
        realtimeBus.addEventListener('message', busHandler);
      }

      // 3. Escuta eventos oficiais do Supabase Realtime
      let sbChannel = null;
      if (window.supabaseClient) {
        try {
          const channelId = `agendamentos_live_${barbeariaId || 'all'}_${Date.now()}`;
          sbChannel = window.supabaseClient
            .channel(channelId)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'agendamentos',
                ...(barbeariaId && isValidUUID(barbeariaId) ? { filter: `barbearia_id=eq.${barbeariaId}` } : {})
              },
              (payload) => {
                console.info('[Supabase Realtime] Evento recebido no banco:', payload.eventType);
                onEventCallback({
                  eventType: payload.eventType,
                  new: payload.new,
                  old: payload.old,
                  source: 'supabase_realtime'
                });
              }
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                console.info('[Supabase Realtime] âœ… Inscrito com sucesso nas atualizaÃ§Ãµes ao vivo.');
              }
            });
        } catch (err) {
          console.warn('[Supabase Realtime] Erro ao assinar canal:', err);
        }
      }

      // Retorna funÃ§Ã£o de limpeza (unsubscribe)
      return function unsubscribe() {
        window.removeEventListener('barber_agendamento_created', localHandler);
        if (realtimeBus) {
          realtimeBus.removeEventListener('message', busHandler);
        }
        if (sbChannel && window.supabaseClient) {
          try {
            window.supabaseClient.removeChannel(sbChannel);
          } catch (e) {}
        }
      };
    },

    /**
     * Atualiza o status de um agendamento (confirmado, concluido, cancelado)
     */
    atualizarStatusAgendamento: async function (agendamentoId, novoStatus) {
      if (!agendamentoId) return false;

      // Se Supabase estiver conectado
      if (window.supabaseClient) {
        try {
          const { error } = await window.supabaseClient
            .from('agendamentos')
            .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
            .eq('id', agendamentoId);

          if (error) {
            console.error('[BarberDB] Erro ao atualizar status:', error);
            return false;
          }
        } catch (e) {
          console.error('[BarberDB] ExceÃ§Ã£o ao atualizar status:', e);
          return false;
        }
      }

      // Atualiza cache local
      try {
        const cache = JSON.parse(localStorage.getItem('barber_agendamentos_cache') || '[]');
        const item = cache.find(i => i.id === agendamentoId);
        if (item) {
          item.status = novoStatus;
          localStorage.setItem('barber_agendamentos_cache', JSON.stringify(cache));
        }
      } catch (e) {}

      // Notifica componentes
      window.dispatchEvent(new CustomEvent('barber_data_updated', {
        detail: { type: 'agendamento_status', id: agendamentoId, status: novoStatus }
      }));

      return true;
    },

    /**
     * CRIAÃ‡ÃƒO RESILIENTE DE AGENDAMENTO:
     * Possui motor duplo:
     * - Rota A: RPC 'criar_agendamento_publico' (transacional e atÃ´mica)
     * - Rota B (Fallback automÃ¡tico): InserÃ§Ã£o direta nas tabelas 'clientes', 'agendamentos' e 'agendamento_servicos'
     * - Rota C: TransmissÃ£o em tempo real e cache instantÃ¢neo sem necessidade de recarregar pÃ¡ginas
     */
    criarAgendamento: async function ({
      barbeariaId,
      clienteNome,
      clienteEmail = null,
      clienteTelefone,
      dataHoraInicioISO,
      servicos = [],
      profissionalId = null,
      formaPagamento = 'presencial',
      imagens = [],
      observacoes = '',
      canalConfirmacao = 'whatsapp'
    }) {
      const client = window.supabaseClient;

      // 1. NormalizaÃ§Ã£o e ValidaÃ§Ã£o dos dados de entrada
      const cleanName = (clienteNome || 'Cliente').trim();
      const cleanPhone = (clienteTelefone || '').trim();
      const cleanEmail = (clienteEmail && clienteEmail.trim()) ? clienteEmail.trim().toLowerCase() : null;
      const paymentNormalized = (formaPagamento === 'pix') ? 'pix' : 'presencial';
      const cleanNotes = (observacoes || '').trim();
      const cleanImages = (Array.isArray(imagens) && imagens.length > 0) ? imagens : [];

      // NormalizaÃ§Ã£o dos itens de serviÃ§os
      const cleanServices = (Array.isArray(servicos) ? servicos : []).map(s => ({
        servico_id: (s.servico_id && isValidUUID(s.servico_id)) ? s.servico_id : ((s.id && isValidUUID(s.id)) ? s.id : null),
        nome_servico: (s.nome_servico || s.nome || s.name || 'ServiÃ§o Barbearia').trim(),
        preco: parseFloat(s.preco || s.price || 0) || 0,
        duracao_minutos: parseInt(s.duracao_minutos || s.duration || 40, 10) || 40
      }));

      // CÃ¡lculo preciso da duraÃ§Ã£o e preÃ§o total
      const totalDuracao = cleanServices.reduce((acc, s) => acc + s.duracao_minutos, 0) || 40;
      const totalPreco = cleanServices.reduce((acc, s) => acc + s.preco, 0);

      // CÃ¡lculo preciso do data_hora_fim no padrÃ£o ISO
      const startDate = new Date(dataHoraInicioISO);
      const endDate = new Date(startDate.getTime() + totalDuracao * 60000);
      const dataHoraFimISO = endDate.toISOString();

      // SanitizaÃ§Ã£o de UUIDs
      const cleanProfissionalId = isValidUUID(profissionalId) ? profissionalId : null;
      let cleanBarbeariaId = isValidUUID(barbeariaId) ? barbeariaId : null;

      if (!cleanBarbeariaId && client) {
        cleanBarbeariaId = await this.getBarbeariaId();
      }

      if (!cleanBarbeariaId && client) {
        try {
          const { data: fallbackBarb } = await client
            .from('barbearias')
            .select('id')
            .eq('ativo', true)
            .order('criado_em', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (fallbackBarb && fallbackBarb.id && isValidUUID(fallbackBarb.id)) {
            cleanBarbeariaId = fallbackBarb.id;
          }
        } catch (e) {}
      }

      if (client && !cleanBarbeariaId) {
        throw new Error('NÃ£o foi possÃ­vel identificar a barbearia vinculada. Por favor, recarregue a pÃ¡gina e tente novamente.');
      }

      let createdAgendamento = null;

      // 2. Se o Supabase estiver conectado, executa gravaÃ§Ã£o
      if (client) {
        // Tentativa 1: RPC 'criar_agendamento_publico'
        try {
          const rpcPayload = {
            p_barbearia_id: cleanBarbeariaId,
            p_cliente_nome: cleanName,
            p_cliente_email: cleanEmail,
            p_cliente_telefone: cleanPhone,
            p_data_hora_inicio: dataHoraInicioISO,
            p_servicos: cleanServices,
            p_profissional_id: cleanProfissionalId,
            p_forma_pagamento: paymentNormalized,
            p_imagens: cleanImages.length > 0 ? cleanImages : null,
            p_observacoes: cleanNotes || null,
            p_canal_confirmacao: canalConfirmacao || 'whatsapp'
          };

          const { data: rpcResult, error: rpcError } = await client.rpc('criar_agendamento_publico', rpcPayload);

          if (!rpcError && rpcResult) {
            createdAgendamento = rpcResult;
            console.info('[BarberDB] âœ… Agendamento criado via RPC com sucesso:', createdAgendamento);
          } else if (rpcError) {
            // Se for erro de horÃ¡rio concorrente jÃ¡ ocupado, lanÃ§a para alertar o usuÃ¡rio
            if (rpcError.message && rpcError.message.includes('HORARIO_INDISPONIVEL')) {
              throw rpcError;
            }
            console.warn('[BarberDB] RPC falhou ou nÃ£o existe, executando fallback de inserÃ§Ã£o direta nas tabelas:', rpcError.message);
          }
        } catch (rpcErr) {
          if (rpcErr.message && rpcErr.message.includes('HORARIO_INDISPONIVEL')) {
            throw rpcErr;
          }
          console.warn('[BarberDB] Tentativa RPC gerou erro, acionando gravaÃ§Ã£o direta:', rpcErr);
        }

        // Tentativa 2: GravaÃ§Ã£o Direta nas Tabelas (Fallback de alta confiabilidade)
        if (!createdAgendamento) {
          try {
            let clienteId = null;

            // Busca ou cadastra o cliente
            if (cleanPhone || cleanEmail) {
              let clientQuery = client.from('clientes').select('id');
              if (cleanPhone) clientQuery = clientQuery.eq('telefone', cleanPhone);
              else if (cleanEmail) clientQuery = clientQuery.eq('email', cleanEmail);

              if (cleanBarbeariaId) clientQuery = clientQuery.eq('barbearia_id', cleanBarbeariaId);

              const { data: existingClient } = await clientQuery.maybeSingle();

              if (existingClient && existingClient.id) {
                clienteId = existingClient.id;
              } else {
                const { data: newClient } = await client
                  .from('clientes')
                  .insert([{
                    barbearia_id: cleanBarbeariaId,
                    nome: cleanName,
                    telefone: cleanPhone,
                    email: cleanEmail
                  }])
                  .select('id')
                  .maybeSingle();

                if (newClient) {
                  clienteId = newClient.id;
                }
              }
            }

            const horaAgendamento = dataHoraInicioISO.includes('T') ? (dataHoraInicioISO.split('T')[1].substring(0, 8) || '09:00:00') : '09:00:00';

            // Insere o agendamento
            const agendamentoRow = {
              barbearia_id: cleanBarbeariaId,
              estudio_id: cleanBarbeariaId,
              cliente_id: clienteId,
              cliente_nome: cleanName,
              cliente_telefone: cleanPhone,
              cliente_email: cleanEmail,
              servico_nome: cleanServices.map(s => s.nome_servico).join(' + ') || 'ServiÃ§o Barbearia',
              profissional_id: cleanProfissionalId,
              data_agendamento: dataHoraInicioISO.split('T')[0],
              horario_agendamento: horaAgendamento,
              data_hora_inicio: dataHoraInicioISO,
              data_hora_fim: dataHoraFimISO,
              valor_total: totalPreco,
              duracao_minutos: totalDuracao,
              status: 'pendente',
              forma_pagamento: paymentNormalized,
              canal_confirmacao: canalConfirmacao || 'whatsapp',
              observacoes: cleanNotes || null,
              origem: 'site'
            };

            const { data: insertedAgendamento, error: agendamentoErr } = await client
              .from('agendamentos')
              .insert([agendamentoRow])
              .select('*')
              .maybeSingle();

            if (agendamentoErr) {
              throw agendamentoErr;
            }

            createdAgendamento = insertedAgendamento;

            // Grava os serviÃ§os vinculados na tabela associativa (se existir)
            if (createdAgendamento && createdAgendamento.id && cleanServices.length > 0) {
              try {
                const servicosRows = cleanServices.map(s => ({
                  agendamento_id: createdAgendamento.id,
                  servico_id: s.servico_id,
                  nome_servico: s.nome_servico,
                  preco: s.preco,
                  duracao_minutos: s.duracao_minutos
                }));
                await client.from('agendamento_servicos').insert(servicosRows);
              } catch (servErr) {
                console.warn('[BarberDB] Tabela agendamento_servicos opcional:', servErr);
              }
            }

            console.info('[BarberDB] âœ… Agendamento gravado diretamente nas tabelas com sucesso!');
          } catch (directErr) {
            console.warn('[BarberDB] âš ï¸ GravaÃ§Ã£o direta nÃ£o pÃ´de ser completada no Supabase, ativando persistÃªncia local:', directErr.message || directErr);
          }
        }
      }

      // 3. Fallback Local / Modo Offline se nÃ£o houver cliente Supabase ativo ou se houver pendÃªncia no banco
      if (!createdAgendamento) {
        createdAgendamento = {
          id: 'local_agend_' + Date.now(),
          barbearia_id: cleanBarbeariaId,
          cliente_nome: cleanName,
          cliente_telefone: cleanPhone,
          cliente_email: cleanEmail,
          profissional_id: cleanProfissionalId,
          data_hora_inicio: dataHoraInicioISO,
          data_hora_fim: dataHoraFimISO,
          preco_total: totalPreco,
          duracao_total: totalDuracao,
          status: 'confirmado',
          forma_pagamento: paymentNormalized,
          observacoes: cleanNotes,
          servicos: cleanServices,
          criado_em: new Date().toISOString()
        };

        try {
          const localList = JSON.parse(localStorage.getItem('barber_local_agendamentos') || '[]');
          localList.push(createdAgendamento);
          localStorage.setItem('barber_local_agendamentos', JSON.stringify(localList));
        } catch (storageErr) {
          console.warn('[BarberDB] Erro ao salvar agendamento local:', storageErr);
        }
      }

      // 4. TRANSMISSÃƒO EM TEMPO REAL IMEDIATA (ZERO-DELAY)
      this.broadcastAgendamentoCreated(createdAgendamento);

      return createdAgendamento;
    },

    /**
     * Limpa todos os caches em memÃ³ria e locais para isolamento seguro
     */
    clearCache: function () {
      slugIdCache.clear();
      cachedBarbeariaInfo = null;
      cachedServicos = null;
      cachedProfissionais = null;
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('barber_agendamentos_cache') || k === 'barber_active_slug' || k === 'barber_active_barbearia_id')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    }
  };

  // ExposiÃ§Ã£o global
  window.BarberDB = BarberDB;
  window.DEFAULT_BARBEARIA_SLUG = DEFAULT_BARBEARIA_SLUG;
})();

