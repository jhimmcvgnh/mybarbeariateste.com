// ============================================================
// SCRIPT DE TESTES DO BANCO DE DADOS - BARBEARIA QUIZ SITE
// ⚠️  Configure as credenciais no .env antes de executar este script
// ============================================================

const fs = require('fs');
const path = require('path');

let envUrl = process.env.VITE_SUPABASE_URL || '';
let envKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!envUrl || !envKey) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
        envUrl = trimmed.replace('VITE_SUPABASE_URL=', '').trim();
      }
      if (trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) {
        envKey = trimmed.replace('VITE_SUPABASE_ANON_KEY=', '').trim();
      }
    });
  } catch (e) {}
}

const SUPABASE_URL = envUrl;
const SUPABASE_KEY = envKey;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n❌ Credenciais do Supabase não configuradas.');
  console.log('👉 Abra o arquivo .env e preencha:\n');
  console.log('   VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co');
  console.log('   VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON\n');
  process.exit(1);
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

let results = { passed: 0, failed: 0, tests: [] };

function log(status, test, msg) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${test}: ${msg}`);
  results.tests.push({ status, test, msg });
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
}

async function api(path, method = 'GET', body = null) {
  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function run() {
  console.log('\n🔍 INICIANDO TESTES DO BANCO DE DADOS\n');
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Hora dos testes:', new Date().toLocaleString('pt-BR'), '\n');
  console.log('=' .repeat(60));

  console.log('\n📡 BLOCO 1: CONECTIVIDADE E TABELAS\n');
  const tables = ['barbearias', 'profissionais', 'servicos', 'agendamentos', 'clientes', 'agendamento_servicos', 'horarios_disponiveis'];
  for (const t of tables) {
    const { status } = await api(`/rest/v1/${t}?select=*&limit=1`);
    if (status === 200) log('PASS', `Tabela ${t}`, 'Acessível (status 200)');
    else log('FAIL', `Tabela ${t}`, `Status inesperado: ${status}`);
  }

  console.log('\n📊 BLOCO 2: CONTAGEM DE DADOS\n');
  for (const t of tables) {
    const { status, data } = await api(`/rest/v1/${t}?select=count`);
    if (status === 200) {
      const count = Array.isArray(data) ? data.length : '?';
      if (count === 0) log('WARN', t, `0 registro(s) - tabela vazia`);
      else log('PASS', t, `${count} registro(s) encontrado(s)`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('\n📋 RESULTADO DOS TESTES:');
  console.log(`  ✅ Passaram: ${results.passed}`);
  console.log(`  ❌ Falharam: ${results.failed}\n`);

  if (results.failed > 0) {
    console.log('⚠️  Execute o arquivo supabase_schema.sql no painel do Supabase.');
  } else {
    console.log('🎉 Banco de dados configurado corretamente!\n');
  }
}

run().catch(console.error);
