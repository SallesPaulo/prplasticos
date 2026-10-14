
const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";

  const item = cookies
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith(nome + "="));

  if (!item) return null;

  try {
    return decodeURIComponent(item.substring(nome.length + 1));
  } catch {
    return null;
  }
}

function tokenEsperado(email, senha, segredo) {
  return crypto
    .createHash("sha256")
    .update(email + senha + segredo)
    .digest("hex");
}

function compararSeguro(a, b) {
  if (!a || !b) return false;

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return bufferA.length === bufferB.length &&
    crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      erro: "Método não permitido."
    });
  }

  const email = process.env.PAINEL_EMAIL;
  const senha = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;

  if (!email || !senha || !segredo) {
    return res.status(500).json({
      erro: "Autenticação não configurada."
    });
  }

  const token = obterCookie(req, "painel_token");
  const esperado = tokenEsperado(email, senha, segredo);

  if (!compararSeguro(token, esperado)) {
    return res.status(401).json({
      erro: "Faça login no painel para continuar."
    });
  }

  const body = req.body || {};
  const {
    numero, nome, empresa, cnpj, email: emailCliente,
    telefone, cidade, itens, total, observacoes
  } = body;

  if (
    typeof numero !== "string" || !numero.trim() ||
    typeof nome !== "string" || !nome.trim() ||
    typeof empresa !== "string" || !empresa.trim() ||
    typeof emailCliente !== "string" || !emailCliente.trim() ||
    !Array.isArray(itens) || itens.length === 0
  ) {
    return res.status(400).json({
      erro: "Dados obrigatórios do orçamento inválidos."
    });
  }

  const valorTotal = Number(total);

  if (!Number.isFinite(valorTotal) || valorTotal < 0) {
    return res.status(400).json({
      erro: "Valor total inválido."
    });
  }

  const url = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!url || !chave) {
    return res.status(500).json({
      erro: "Banco de dados não configurado."
    });
  }

  try {
    const resposta = await fetch(`${url}/rest/v1/pedidos`, {
      method: "POST",
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        numero: numero.trim(),
        nome: nome.trim(),
        empresa: empresa.trim(),
        cnpj: cnpj || null,
        email: emailCliente.trim(),
        telefone: telefone || null,
        cidade: cidade || null,
        itens,
        total: valorTotal,
        observacoes: observacoes || null
      })
    });

    if (!resposta.ok) {
      console.error("Falha ao salvar pedido:", await resposta.text());

      return res.status(500).json({
        erro: "Não foi possível salvar o orçamento."
      });
    }

    return res.status(201).json({
      sucesso: true,
      mensagem: "Orçamento registrado."
    });
  } catch (erro) {
    console.error("Erro ao salvar pedido:", erro);

    return res.status(500).json({
      erro: "Falha ao comunicar com o banco de dados."
    });
  }
};
