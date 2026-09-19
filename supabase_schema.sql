-- ============================================================================
-- SCRIPT DE ESTRUTURAÇÃO DO BANCO DE DADOS (SUPABASE / POSTGRESQL)
-- PLATAFORMA DE AGENDAMENTO PARA BARBEARIAS (SITE PÚBLICO + SISTEMA DO DONO)
-- ============================================================================

-- 1. EXTENSÕES ESSENCIAIS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. ENUMS DE STATUS, PAGAMENTOS E CANAIS (100% EM PORTUGUÊS)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE status_agendamento AS ENUM ('pendente', 'confirmado', 'concluido', 'cancelado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE forma_pagamento_tipo AS ENUM ('presencial', 'pix', 'cartao_online');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE canal_confirmacao_tipo AS ENUM ('whatsapp', 'email', 'sms');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. TABELAS PRINCIPAIS (MULTI-TENANCY & ESTRUTURA DO NEGÓCIO)
-- ============================================================================

-- 3.1. ESTÚDIOS / BARBEARIAS
CREATE TABLE IF NOT EXISTS public.estudios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dono_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    telefone VARCHAR(50),
    email_contato VARCHAR(255),
    logo_url TEXT,
    endereco TEXT,
    chave_pix VARCHAR(255),
    tipo_chave_pix VARCHAR(50),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela/View de compatibilidade 'barbearias' (para total interoperabilidade)
CREATE TABLE IF NOT EXISTS public.barbearias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dono_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    telefone VARCHAR(50),
    email_contato VARCHAR(255),
    logo_url TEXT,
    endereco TEXT,
    chave_pix VARCHAR(255),
    tipo_chave_pix VARCHAR(50),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2. PERFIS DE USUÁRIOS (DONO, BARBEIRO, ADMIN)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    estudio_id UUID REFERENCES public.estudios(id) ON DELETE SET NULL,
    barbearia_id UUID REFERENCES public.barbearias(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    cargo VARCHAR(50) DEFAULT 'dono',
    telefone VARCHAR(50),
    avatar_url TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3. PROFISSIONAIS (BARBEIROS DA EQUIPE)
CREATE TABLE IF NOT EXISTS public.profissionais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudio_id UUID REFERENCES public.estudios(id) ON DELETE CASCADE,
    barbearia_id UUID REFERENCES public.barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    especialidade VARCHAR(255) DEFAULT 'Barbeiro Especialista',
    telefone VARCHAR(50),
    email VARCHAR(255),
    avatar_url TEXT,
    avaliacao_media NUMERIC(3,2) DEFAULT 5.00,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4. SERVIÇOS OFERECIDOS
CREATE TABLE IF NOT EXISTS public.servicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudio_id UUID REFERENCES public.estudios(id) ON DELETE CASCADE,
    barbearia_id UUID REFERENCES public.barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    preco NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    duracao_minutos INTEGER NOT NULL DEFAULT 40,
    icone VARCHAR(100),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.5. CLIENTES
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudio_id UUID REFERENCES public.estudios(id) ON DELETE CASCADE,
    barbearia_id UUID REFERENCES public.barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    total_agendamentos INTEGER DEFAULT 0,
    ultimo_agendamento TIMESTAMPTZ,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.6. HORÁRIOS CONFIGURADOS DE FUNCIONAMENTO
CREATE TABLE IF NOT EXISTS public.horarios_disponiveis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudio_id UUID REFERENCES public.estudios(id) ON DELETE CASCADE,
    barbearia_id UUID REFERENCES public.barbearias(id) ON DELETE CASCADE,
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=Dom, 1=Seg, ... 6=Sab
    horario TIME NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true
);

-- 3.7. AGENDAMENTOS (TABELA CENTRAL)
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudio_id UUID REFERENCES public.estudios(id) ON DELETE CASCADE,
    barbearia_id UUID REFERENCES public.barbearias(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
    
    -- Dados de contato e histórico
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_telefone VARCHAR(50) NOT NULL,
    cliente_email VARCHAR(255),
    servico_nome VARCHAR(255) NOT NULL,
    
    -- Datas e horários
    data_agendamento DATE NOT NULL,
    horario_agendamento TIME NOT NULL,
    data_hora_inicio TIMESTAMPTZ NOT NULL,
    data_hora_fim TIMESTAMPTZ NOT NULL,
    
    -- Financeiro e Tempo
    valor_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    duracao_minutos INTEGER NOT NULL DEFAULT 40,
    
    -- Status e Forma de Pagamento
    forma_pagamento forma_pagamento_tipo NOT NULL DEFAULT 'presencial',
    status status_agendamento NOT NULL DEFAULT 'pendente',
    canal_confirmacao canal_confirmacao_tipo DEFAULT 'whatsapp',
    
    -- Mídia e Observações
    imagens JSONB DEFAULT '[]'::jsonb,
    observacoes TEXT,
    origem VARCHAR(50) DEFAULT 'site',
    
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT check_agendamento_datas CHECK (data_hora_fim > data_hora_inicio)
);

-- 3.8. AGENDAMENTO_SERVIÇOS (ITENS DE SERVIÇO VINCULADOS AO AGENDAMENTO)
CREATE TABLE IF NOT EXISTS public.agendamento_servicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
    servico_id UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
    nome_servico VARCHAR(255) NOT NULL,
    preco NUMERIC(10,2) NOT NULL,
    duracao_minutos INTEGER NOT NULL
);

-- ============================================================================
-- 4. ÍNDICES DE ALTA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agendamentos_barb_data ON public.agendamentos(barbearia_id, data_agendamento);
CREATE INDEX IF NOT EXISTS idx_agendamentos_estudio_data ON public.agendamentos(estudio_id, data_agendamento);
CREATE INDEX IF NOT EXISTS idx_agendamentos_conflito_barb ON public.agendamentos(barbearia_id, profissional_id, data_hora_inicio, data_hora_fim) WHERE status != 'cancelado';
CREATE INDEX IF NOT EXISTS idx_barbearias_slug ON public.barbearias(slug);
CREATE INDEX IF NOT EXISTS idx_estudios_slug ON public.estudios(slug);
CREATE INDEX IF NOT EXISTS idx_perfis_dono ON public.perfis(id);

-- ============================================================================
-- 5. FUNÇÕES E TRIGGERS IDEMPOTENTES (CADASTRO/LOGIN DO DONO)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_novo_usuario_barbearia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_nome_barbearia TEXT;
    v_slug TEXT;
    v_barbearia_id UUID;
    v_nome_usuario TEXT;
BEGIN
    v_nome_barbearia := COALESCE(NEW.raw_user_meta_data->>'nome_barbearia', NEW.raw_user_meta_data->>'shopName', 'Minha Barbearia');
    v_nome_usuario := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));
    
    -- 1. Verifica se o usuário já possui barbearia criada anteriormente (Garante idempotência total)
    SELECT id INTO v_barbearia_id FROM public.barbearias WHERE dono_id = NEW.id LIMIT 1;

    IF v_barbearia_id IS NULL THEN
        -- Gera slug legível e único
        v_slug := lower(regexp_replace(v_nome_barbearia, '[^a-zA-Z0-9]+', '-', 'g'));
        v_slug := trim(both '-' from v_slug) || '-' || substr(md5(NEW.id::text || clock_timestamp()::text), 1, 6);

        -- Cria barbearia e estúdio vinculados ao dono_id
        INSERT INTO public.barbearias (dono_id, nome, slug, email_contato, ativo)
        VALUES (NEW.id, v_nome_barbearia, v_slug, NEW.email, true)
        RETURNING id INTO v_barbearia_id;

        INSERT INTO public.estudios (id, dono_id, nome, slug, email_contato, ativo)
        VALUES (v_barbearia_id, NEW.id, v_nome_barbearia, v_slug, NEW.email, true)
        ON CONFLICT (id) DO NOTHING;

        -- Cria profissional padrão inicial
        INSERT INTO public.profissionais (barbearia_id, estudio_id, nome, especialidade, avatar_url)
        VALUES 
            (v_barbearia_id, v_barbearia_id, 'Barbeiro Principal', 'Master Barbeiro', 'https://appointments-production-f.squarecdn.com/files/ca72fa4ade643e8d49ecca2d5b4d8f12/original.png');

        -- Cria serviços padrão iniciais
        INSERT INTO public.servicos (barbearia_id, estudio_id, nome, descricao, preco, duracao_minutos)
        VALUES 
            (v_barbearia_id, v_barbearia_id, 'O Corte de Cabelo', 'Consulta personalizada, corte de precisão e finalização manual.', 35.00, 40),
            (v_barbearia_id, v_barbearia_id, 'Corte + Sobrancelha', 'Corte de precisão alinhado com design profissional de sobrancelha.', 50.00, 45),
            (v_barbearia_id, v_barbearia_id, 'Corte + Aparagem de Barba', 'Corte detalhado com escultura de barba e toalha quente.', 60.00, 50);

        -- Cria horários padrão de funcionamento (Seg a Sáb, 09:00 às 19:00)
        INSERT INTO public.horarios_disponiveis (barbearia_id, estudio_id, dia_semana, horario)
        SELECT v_barbearia_id, v_barbearia_id, dia, hora::time
        FROM generate_series(1, 6) dia
        CROSS JOIN (
            VALUES ('09:00'), ('09:45'), ('10:30'), ('11:15'), ('13:00'), ('13:45'), ('14:30'), ('15:15'), ('16:00'), ('16:45'), ('17:30'), ('18:15'), ('19:00')
        ) AS h(hora);
    END IF;

    -- 2. Cria ou atualiza o perfil com o barbearia_id correto
    INSERT INTO public.perfis (id, barbearia_id, estudio_id, nome, email, cargo)
    VALUES (NEW.id, v_barbearia_id, v_barbearia_id, v_nome_usuario, NEW.email, 'dono')
    ON CONFLICT (id) DO UPDATE SET
        barbearia_id = COALESCE(public.perfis.barbearia_id, EXCLUDED.barbearia_id),
        estudio_id = COALESCE(public.perfis.estudio_id, EXCLUDED.estudio_id),
        nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        atualizado_em = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_novo_usuario_barbearia ON auth.users;
CREATE TRIGGER trg_novo_usuario_barbearia
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_novo_usuario_barbearia();

-- ============================================================================
-- 6. RPC: RESOLUÇÃO DE SLUG E DISPONIBILIDADE
-- ============================================================================

-- 6.1. Busca ID da barbearia pelo slug
CREATE OR REPLACE FUNCTION public.buscar_barbearia_id_por_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.barbearias WHERE slug = lower(trim(p_slug)) AND ativo = true LIMIT 1;
    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.estudios WHERE slug = lower(trim(p_slug)) AND ativo = true LIMIT 1;
    END IF;
    RETURN v_id;
END;
$$;

-- 6.2. Busca intervalos ocupados para uma data
CREATE OR REPLACE FUNCTION public.buscar_disponibilidade(
    p_barbearia_id UUID,
    p_data TEXT,
    p_profissional_id UUID DEFAULT NULL
)
RETURNS TABLE (
    inicio TIMESTAMPTZ,
    fim TIMESTAMPTZ,
    profissional_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.data_hora_inicio AS inicio,
        a.data_hora_fim AS fim,
        a.profissional_id
    FROM public.agendamentos a
    WHERE (a.barbearia_id = p_barbearia_id OR a.estudio_id = p_barbearia_id)
      AND a.status != 'cancelado'
      AND a.data_agendamento = p_data::DATE
      AND (p_profissional_id IS NULL OR a.profissional_id = p_profissional_id);
END;
$$;

-- ============================================================================
-- 7. RPC: CRIAÇÃO ATÔMICA DE AGENDAMENTO (PREVENÇÃO DE DOUBLE-BOOKING)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.criar_agendamento_publico(
    p_barbearia_id UUID,
    p_cliente_nome TEXT,
    p_cliente_email TEXT,
    p_cliente_telefone TEXT,
    p_data_hora_inicio TIMESTAMPTZ,
    p_servicos JSONB,
    p_profissional_id UUID DEFAULT NULL,
    p_forma_pagamento TEXT DEFAULT 'presencial',
    p_imagens JSONB DEFAULT '[]'::jsonb,
    p_observacoes TEXT DEFAULT NULL,
    p_canal_confirmacao TEXT DEFAULT 'whatsapp'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_barb_id UUID := p_barbearia_id;
    v_cliente_id UUID;
    v_total_duracao INT := 0;
    v_total_preco NUMERIC(10,2) := 0.00;
    v_servico_nomes TEXT := '';
    v_item RECORD;
    v_data_hora_fim TIMESTAMPTZ;
    v_data_agendamento DATE;
    v_hora_agendamento TIME;
    v_conflito INT;
    v_novo_agendamento RECORD;
    v_prof_id UUID := p_profissional_id;
    v_forma_pag forma_pagamento_tipo := 'presencial';
BEGIN
    -- 1. Valida existência da barbearia/estúdio
    IF NOT EXISTS (
        SELECT 1 FROM public.barbearias WHERE id = v_barb_id AND ativo = true
        UNION
        SELECT 1 FROM public.estudios WHERE id = v_barb_id AND ativo = true
    ) THEN
        RAISE EXCEPTION 'BARBEARIA_NAO_ENCONTRADA';
    END IF;

    -- 2. Normaliza forma de pagamento
    IF p_forma_pagamento = 'pix' THEN
        v_forma_pag := 'pix';
    ELSIF p_forma_pagamento = 'cartao_online' THEN
        v_forma_pag := 'cartao_online';
    ELSE
        v_forma_pag := 'presencial';
    END IF;

    -- 3. Calcula duração total e preço somando os serviços
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_servicos) AS (
        servico_id UUID,
        nome_servico TEXT,
        preco NUMERIC,
        duracao_minutos INT
    )
    LOOP
        v_total_duracao := v_total_duracao + COALESCE(v_item.duracao_minutos, 40);
        v_total_preco := v_total_preco + COALESCE(v_item.preco, 0.00);
        IF v_servico_nomes = '' THEN
            v_servico_nomes := v_item.nome_servico;
        ELSE
            v_servico_nomes := v_servico_nomes || ' + ' || v_item.nome_servico;
        END IF;
    END LOOP;

    IF v_total_duracao <= 0 THEN v_total_duracao := 40; END IF;
    IF v_servico_nomes = '' THEN v_servico_nomes := 'Serviço Barbearia'; END IF;

    v_data_hora_fim := p_data_hora_inicio + (v_total_duracao || ' minutes')::INTERVAL;
    v_data_agendamento := p_data_hora_inicio::DATE;
    v_hora_agendamento := p_data_hora_inicio::TIME;

    -- 4. Se profissional for nulo (Qualquer Barbeiro), seleciona o primeiro disponível
    IF v_prof_id IS NULL THEN
        SELECT p.id INTO v_prof_id
        FROM public.profissionais p
        WHERE (p.barbearia_id = v_barb_id OR p.estudio_id = v_barb_id) AND p.ativo = true
        AND NOT EXISTS (
            SELECT 1 FROM public.agendamentos a
            WHERE (a.barbearia_id = v_barb_id OR a.estudio_id = v_barb_id)
              AND a.profissional_id = p.id
              AND a.status != 'cancelado'
              AND a.data_hora_inicio < v_data_hora_fim
              AND a.data_hora_fim > p_data_hora_inicio
        )
        LIMIT 1;
    END IF;

    -- 5. Checagem Atômica de Conflito de Horário (Double-Booking)
    IF v_prof_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_conflito
        FROM public.agendamentos a
        WHERE (a.barbearia_id = v_barb_id OR a.estudio_id = v_barb_id)
          AND a.profissional_id = v_prof_id
          AND a.status != 'cancelado'
          AND a.data_hora_inicio < v_data_hora_fim
          AND a.data_hora_fim > p_data_hora_inicio;

        IF v_conflito > 0 THEN
            RAISE EXCEPTION 'HORARIO_INDISPONIVEL: Este horário já foi reservado por outro cliente.';
        END IF;
    END IF;

    -- 6. Upsert do Cliente
    INSERT INTO public.clientes (barbearia_id, estudio_id, nome, telefone, email, total_agendamentos, ultimo_agendamento)
    VALUES (v_barb_id, v_barb_id, p_cliente_nome, p_cliente_telefone, p_cliente_email, 1, NOW())
    RETURNING id INTO v_cliente_id;

    -- 7. Inserção do Agendamento
    INSERT INTO public.agendamentos (
        barbearia_id,
        estudio_id,
        cliente_id,
        profissional_id,
        cliente_nome,
        cliente_telefone,
        cliente_email,
        servico_nome,
        data_agendamento,
        horario_agendamento,
        data_hora_inicio,
        data_hora_fim,
        valor_total,
        duracao_minutos,
        forma_pagamento,
        status,
        canal_confirmacao,
        imagens,
        observacoes,
        origem
    ) VALUES (
        v_barb_id,
        v_barb_id,
        v_cliente_id,
        v_prof_id,
        p_cliente_nome,
        p_cliente_telefone,
        p_cliente_email,
        v_servico_nomes,
        v_data_agendamento,
        v_hora_agendamento,
        p_data_hora_inicio,
        v_data_hora_fim,
        v_total_preco,
        v_total_duracao,
        v_forma_pag,
        'pendente',
        COALESCE(p_canal_confirmacao, 'whatsapp')::canal_confirmacao_tipo,
        COALESCE(p_imagens, '[]'::jsonb),
        p_observacoes,
        'site'
    )
    RETURNING * INTO v_novo_agendamento;

    -- 8. Inserção dos serviços detalhados
    INSERT INTO public.agendamento_servicos (agendamento_id, servico_id, nome_servico, preco, duracao_minutos)
    SELECT
        v_novo_agendamento.id,
        (s->>'servico_id')::UUID,
        s->>'nome_servico',
        (s->>'preco')::NUMERIC,
        (s->>'duracao_minutos')::INT
    FROM jsonb_array_elements(p_servicos) AS s;

    RETURN to_jsonb(v_novo_agendamento);
END;
$$;

-- ============================================================================
-- 8. POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- ============================================================================

ALTER TABLE public.estudios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbearias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios_disponiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_servicos ENABLE ROW LEVEL SECURITY;

-- 8.1. Barbearias / Estúdios
CREATE POLICY "Leitura pública de barbearias ativas" ON public.barbearias
FOR SELECT USING (ativo = true);

CREATE POLICY "Dono gerencia sua barbearia" ON public.barbearias
FOR ALL USING (auth.uid() = dono_id);

CREATE POLICY "Leitura pública de estúdios ativos" ON public.estudios
FOR SELECT USING (ativo = true);

CREATE POLICY "Dono gerencia seu estúdio" ON public.estudios
FOR ALL USING (auth.uid() = dono_id);

-- 8.2. Perfis
CREATE POLICY "Usuário gerencia seu próprio perfil" ON public.perfis
FOR ALL USING (auth.uid() = id);

-- 8.3. Profissionais, Serviços e Horários (Público lê, Dono edita)
CREATE POLICY "Leitura pública de profissionais" ON public.profissionais
FOR SELECT USING (ativo = true);

CREATE POLICY "Dono gerencia seus profissionais" ON public.profissionais
FOR ALL USING (
    barbearia_id IN (SELECT barbearia_id FROM public.perfis WHERE id = auth.uid()) OR
    estudio_id IN (SELECT estudio_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "Leitura pública de serviços" ON public.servicos
FOR SELECT USING (ativo = true);

CREATE POLICY "Dono gerencia seus serviços" ON public.servicos
FOR ALL USING (
    barbearia_id IN (SELECT barbearia_id FROM public.perfis WHERE id = auth.uid()) OR
    estudio_id IN (SELECT estudio_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "Leitura pública de horários" ON public.horarios_disponiveis
FOR SELECT USING (ativo = true);

CREATE POLICY "Dono gerencia seus horários" ON public.horarios_disponiveis
FOR ALL USING (
    barbearia_id IN (SELECT barbearia_id FROM public.perfis WHERE id = auth.uid()) OR
    estudio_id IN (SELECT estudio_id FROM public.perfis WHERE id = auth.uid())
);

-- 8.4. Clientes
CREATE POLICY "Dono gerencia clientes da sua barbearia" ON public.clientes
FOR ALL USING (
    barbearia_id IN (SELECT barbearia_id FROM public.perfis WHERE id = auth.uid()) OR
    estudio_id IN (SELECT estudio_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "Criação pública de clientes no agendamento" ON public.clientes
FOR INSERT WITH CHECK (true);

-- 8.5. Agendamentos
CREATE POLICY "Público pode criar agendamentos válidos" ON public.agendamentos
FOR INSERT WITH CHECK (
    barbearia_id IS NOT NULL OR estudio_id IS NOT NULL
);

CREATE POLICY "Dono gerencia agendamentos da sua barbearia" ON public.agendamentos
FOR ALL USING (
    barbearia_id IN (SELECT barbearia_id FROM public.perfis WHERE id = auth.uid()) OR
    estudio_id IN (SELECT estudio_id FROM public.perfis WHERE id = auth.uid())
);

CREATE POLICY "Público pode consultar agendamento pelo próprio ID" ON public.agendamentos
FOR SELECT USING (true);

CREATE POLICY "Dono gerencia itens de agendamento" ON public.agendamento_servicos
FOR ALL USING (
    agendamento_id IN (
        SELECT id FROM public.agendamentos
        WHERE barbearia_id IN (SELECT barbearia_id FROM public.perfis WHERE id = auth.uid())
           OR estudio_id IN (SELECT estudio_id FROM public.perfis WHERE id = auth.uid())
    )
);

CREATE POLICY "Criação pública de itens de agendamento" ON public.agendamento_servicos
FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 9. HABILITAÇÃO DO REALTIME NO POSTGRESQL (ZERO-DELAY)
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
