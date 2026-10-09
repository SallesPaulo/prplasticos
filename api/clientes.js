
const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";
  const item = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(nome + "="));

  return item
    ? decodeURIComponent(item.substring(nome.length + 1))
    : null;
}

function criarToken(email, senha, segredo) {
  return crypto
    .createHash("sha256")
    .update(email + senha + segredo)
    .digest("hex");
}

function sessaoValida(req) {
  const email = process.env.PAINEL_EMAIL;
  const senha = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;
  const token = obterCookie(req, "painel_token");

  if (!email || !senha || !segredo || !token) return false;

  const esperado = criarToken(email, senha, segredo);

  if (token.length !== esperado.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(esperado)
  );
}

module.exports = async (req, res) => {
  if (!sessaoValida(req)) {
    return res.status(401).json({
      sucesso: false,
      erro: "Sessão não autorizada."
    });
  }

  const url = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!url || !chave) {
    return res.status(500).json({
      sucesso: false,
      erro: "Configuração do banco não encontrada."
    });
  }

  try {
    if (req.method === "GET") {
      const resposta = await fetch(
        `${url}/rest/v1/clientes?select=*&order=created_at.desc`,
        {
          headers: {
            apikey: chave,
            Authorization: `Bearer ${chave}`
          }
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        console.error("Erro ao consultar clientes:", dados);
        return res.status(502).json({
          sucesso: false,
          erro: "Não foi possível consultar os clientes."
        });
      }

      return res.status(200).json({
        sucesso: true,
        clientes: dados
      });
    }

    if (req.method === "POST") {
      const cliente = req.body || {};

      if (!cliente.nome || !cliente.empresa || !cliente.email) {
        return res.status(400).json({
          sucesso: false,
          erro: "Nome, empresa e e-mail são obrigatórios."
        });
      }

      const resposta = await fetch(`${url}/rest/v1/clientes`, {
        method: "POST",
        headers: {
          apikey: chave,
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
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
          erro: "O banco não conseguiu salvar o cliente. Verifique os dados."
        });
      }

      return res.status(201).json({
        sucesso: true,
        cliente: dados[0]
      });
    }

    res.setHeader("Allow", "GET, POST");
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
