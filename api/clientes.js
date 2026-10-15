
async function validarSessaoSupabase(req) {
  const autorizacao = req.headers.authorization || "";
  const token = autorizacao.startsWith("Bearer ")
    ? autorizacao.slice(7)
    : null;

  if (!token) return false;

  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const chavePublica =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLIC_KEY;

  if (!url || !chavePublica) return false;

  try {
    const resposta = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: chavePublica,
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

  const endpoint = `${url}/rest/v1/clientes`;

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
        console.error("Erro ao consultar clientes:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível consultar os clientes."
        });
      }

      return res.status(200).json({ sucesso: true, clientes: dados });
    }

    if (req.method === "POST") {
      const cliente = req.body || {};

      if (!cliente.nome || !cliente.empresa || !cliente.email) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nome, empresa e e-mail são obrigatórios."
        });
      }

      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          nome: cliente.nome,
          empresa: cliente.empresa,
          email: cliente.email,
          telefone: cliente.telefone || "",
          cidade: cliente.cidade || "",
          uf: cliente.uf || "",
          status: cliente.status || "Ativo",
          observacao: cliente.observacao || ""
        })
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro ao salvar cliente:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível salvar o cliente."
        });
      }

      return res.status(201).json({ sucesso: true, cliente: dados[0] });
    }

    if (req.method === "PATCH") {
      const body = req.body || {};
      const id = Number(body.id);
      const cliente = body.cliente || {};

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "ID do cliente inválido."
        });
      }

      if (!cliente.nome || !cliente.empresa || !cliente.email) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nome, empresa e e-mail são obrigatórios."
        });
      }

      const resposta = await fetch(`${endpoint}?id=eq.${id}&select=*`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          nome: cliente.nome,
          empresa: cliente.empresa,
          email: cliente.email,
          telefone: cliente.telefone || "",
          cidade: cliente.cidade || "",
          uf: cliente.uf || "",
          status: cliente.status || "Ativo",
          observacao: cliente.observacao || ""
        })
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro ao editar cliente:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível editar o cliente."
        });
      }

      if (!dados.length) {
        return res.status(404).json({
          sucesso: false,
          erro: "Cliente não encontrado."
        });
      }

      return res.status(200).json({ sucesso: true, cliente: dados[0] });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query?.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          sucesso: false,
          erro: "ID do cliente inválido."
        });
      }

      const resposta = await fetch(`${endpoint}?id=eq.${id}`, {
        method: "DELETE",
        headers: { ...headers, Prefer: "return=representation" }
      });

      if (!resposta.ok) {
        const dados = await resposta.json();
        console.error("Erro ao excluir cliente:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível excluir o cliente."
        });
      }

      return res.status(200).json({ sucesso: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  } catch (erro) {
    console.error("Erro na API de clientes:", erro);
    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao acessar o banco."
    });
  }
};
