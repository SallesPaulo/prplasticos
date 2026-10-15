
async function validarSessaoSupabase(req) {
  const autorizacao = req.headers.authorization || "";
  const token = autorizacao.startsWith("Bearer ")
    ? autorizacao.slice(7)
    : null;

  if (!token) return false;

  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const chave =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLIC_KEY;

  if (!url || !chave) return false;

  try {
    const resposta = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: chave,
        Authorization: `Bearer ${token}`
      }
    });

    if (!resposta.ok) return false;

    const usuario = await resposta.json();
    return Boolean(usuario.id);
  } catch (erro) {
    console.error("Erro ao validar sessão Supabase:", erro);
    return false;
  }
}

module.exports = async (req, res) => {
  if (!(await validarSessaoSupabase(req))) {
    return res.status(401).json({
      sucesso: false,
      erro: "Sessão Supabase não autorizada."
    });
  }

  const urlBase = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!urlBase || !chave) {
    return res.status(500).json({
      sucesso: false,
      erro: "Configuração do banco não encontrada."
    });
  }

  const url = urlBase
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/rest\/?$/, "")
    .replace(/\/+$/, "");

  const endpoint = `${url}/rest/v1/campanhas`;

  const headers = {
    apikey: chave,
    Authorization: `Bearer ${chave}`,
    "Content-Type": "application/json"
  };

  try {
    if (req.method === "GET") {
      const resposta = await fetch(
        `${endpoint}?select=*&order=created_at.desc`,
        { headers }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro ao consultar campanhas:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível consultar as campanhas."
        });
      }

      return res.status(200).json({
        sucesso: true,
        campanhas: dados
      });
    }

    if (req.method === "POST") {
      const campanha = req.body || {};

      if (!campanha.nome || !campanha.assunto || !campanha.empresa) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nome, assunto e empresa são obrigatórios."
        });
      }

      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          empresa: campanha.empresa,
          nome: campanha.nome,
          assunto: campanha.assunto,
          lista: campanha.lista || "",
          mensagem: campanha.mensagem || "",
          enviados: Number(campanha.enviados) || 0
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro ao salvar campanha:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível salvar a campanha."
        });
      }

      return res.status(201).json({
        sucesso: true,
        campanha: dados[0]
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  } catch (erro) {
    console.error("Erro na API de campanhas:", erro);
    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao acessar o banco."
    });
  }
};
