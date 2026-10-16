const crypto = require('crypto');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://tyetobhxkdhrvtsludym.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.CHAVE_SECRETA_SUPABASE || process.env.SUPABASE_SERVICE_ROLE_KEY;

function resposta(res, status, dados) {
  return res.status(status).json(dados);
}

function autorizado(req) {
  const cookies = String(req.headers.cookie || '');
  const tokenCookie = cookies.match(/(?:^|;\s*)painel_token=([^;]+)/);
  if (!tokenCookie) return false;
  const esperado = crypto.createHash('sha256')
    .update(`${process.env.PAINEL_EMAIL || ''}${process.env.PAINEL_SENHA || ''}${process.env.SEGREDO_DO_PAINEL || ''}`)
    .digest('hex');
  let recebido;
  try { recebido = decodeURIComponent(tokenCookie[1]); } catch { recebido = tokenCookie[1]; }
  return recebido.length === esperado.length && crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

async function supabaseFetch(path, options = {}) {
  if (!SUPABASE_KEY) throw new Error('Configure CHAVE_SECRETA_SUPABASE nas variáveis de ambiente.');
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = { mensagem: body }; }
  if (!response.ok) {
    const message = data?.message || data?.msg || data?.hint || data?.details || data?.error || data?.mensagem || `Supabase retornou ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function dataValida(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return resposta(res, 405, { sucesso: false, erro: 'Método não permitido.' });
  }
  if (!autorizado(req)) return resposta(res, 401, { sucesso: false, erro: 'Sessão não autorizada.' });

  try {
    if (req.method === 'GET') {
      const inicio = String(req.query?.inicio || '');
      const fim = String(req.query?.fim || '');
      if (!dataValida(inicio) || !dataValida(fim) || inicio > fim) {
        return resposta(res, 400, { sucesso: false, erro: 'Informe um intervalo de datas válido.' });
      }
      const query = `/rest/v1/agenda_visitas?select=id,cliente_id,data_visita,hora_inicio,hora_fim,vendedor,status,observacoes&data_visita=gte.${encodeURIComponent(inicio)}&data_visita=lte.${encodeURIComponent(fim)}&order=data_visita.asc,hora_inicio.asc`;
      const visitas = await supabaseFetch(query);
      return resposta(res, 200, { sucesso: true, visitas: visitas || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const cliente_id = Number(body.cliente_id);
      const vendedor = String(body.vendedor || '').trim();
      const data_visita = String(body.data_visita || '');
      const hora_inicio = String(body.hora_inicio || '');
      const hora_fim = String(body.hora_fim || '');
      const observacoes = String(body.observacoes || '').trim();

      if (!Number.isInteger(cliente_id) || cliente_id <= 0 || !vendedor || !dataValida(data_visita) || !/^\d{2}:\d{2}$/.test(hora_inicio) || !/^\d{2}:\d{2}$/.test(hora_fim)) {
        return resposta(res, 400, { sucesso: false, erro: 'Preencha cliente, vendedor, data e horários válidos.' });
      }
      if (hora_fim <= hora_inicio) return resposta(res, 400, { sucesso: false, erro: 'O horário final precisa ser depois do horário inicial.' });

      const cliente = await supabaseFetch(`/rest/v1/clientes?id=eq.${cliente_id}&select=id&limit=1`);
      if (!cliente || !cliente.length) return resposta(res, 400, { sucesso: false, erro: 'O cliente selecionado não foi encontrado.' });

      const existentes = await supabaseFetch(`/rest/v1/agenda_visitas?data_visita=eq.${encodeURIComponent(data_visita)}&vendedor=eq.${encodeURIComponent(vendedor)}&status=neq.cancelada&select=id,hora_inicio,hora_fim`);
      const conflito = (existentes || []).find(v => String(v.hora_inicio).slice(0,5) < hora_fim && String(v.hora_fim).slice(0,5) > hora_inicio);
      if (conflito) {
        return resposta(res, 409, { sucesso: false, erro: `Este horário conflita com outra visita (${String(conflito.hora_inicio).slice(0,5)}–${String(conflito.hora_fim).slice(0,5)}). Escolha outro horário.` });
      }

      const criada = await supabaseFetch('/rest/v1/agenda_visitas?select=id,cliente_id,data_visita,hora_inicio,hora_fim,vendedor,status,observacoes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cliente_id, vendedor, data_visita, hora_inicio, hora_fim, observacoes: observacoes || null, status: 'agendada' })
      });
      return resposta(res, 201, { sucesso: true, visita: criada?.[0] || null });
    }

    const id = Number(req.body?.id);
    const status = String(req.body?.status || '');
    if (!Number.isInteger(id) || id <= 0 || !['cancelada', 'realizada', 'agendada'].includes(status)) {
      return resposta(res, 400, { sucesso: false, erro: 'Dados inválidos para atualizar a visita.' });
    }
    await supabaseFetch(`/rest/v1/agenda_visitas?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status })
    });
    return resposta(res, 200, { sucesso: true });
  } catch (error) {
    console.error('Erro na API agenda-visitas:', error);
    return resposta(res, error.status || 500, { sucesso: false, erro: error.message || 'Erro interno ao consultar a agenda.' });
  }
};
