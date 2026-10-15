
const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";
  const item = cookies
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith(nome + "="));

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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  }

  if (!sessaoValida(req)) {
    return res.status(401).json({
      sucesso: false,
      erro: "Sessão não autorizada."
    });
  }

  const urlBase = process.env.SUPABASE_URL;
  const chave = process.env.CHAVE_SECRETA_SUPABASE;

  if (!urlBase || !chave) {
    return res.status(500).json({
      sucesso: false,
      erro: "Configuração do Supabase não encontrada."
    });
  }

  const url = urlBase
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/rest\/?$/, "")
    .replace(/\/+$/, "");

  const headers = {
    apikey: chave,
    Authorization: `Bearer ${chave}`,
    "Content-Type": "application/json"
  };

  let usuarioCriadoId = null;

  try {
    const clienteId = Number(req.body?.cliente_id);
    const senhaInicial = req.body?.senhaInicial;

    if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "ID do cliente inválido."
      });
    }

    if (
      typeof senhaInicial !== "string" ||
      senhaInicial.length < 12
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: "A senha inicial deve ter pelo menos 12 caracteres."
      });
    }

    // Busca o cliente já cadastrado.
    const consultaCliente = await fetch(
      `${url}/rest/v1/clientes?id=eq.${clienteId}&select=id,nome,empresa,email`,
      { headers }
    );

    const clientes = await consultaCliente.json();

    if (!consultaCliente.ok) {
      throw new Error("Não foi possível consultar o cliente.");
    }

    if (!clientes.length) {
      return res.status(404).json({
        sucesso: false,
        erro: "Cliente não encontrado."
      });
    }

    const cliente = clientes[0];
    const email = String(cliente.email || "")
      .trim()
      .toLowerCase();

    if (!cliente.nome || !cliente.empresa || !email) {
      return res.status(400).json({
        sucesso: false,
        erro: "O cliente precisa ter nome, empresa e e-mail cadastrados."
      });
    }

    // Impede duplicar o vínculo no portal.
    const consultaUsuario = await fetch(
      `${url}/rest/v1/usuarios_portal?email=eq.${encodeURIComponent(email)}&select=id`,
      { headers }
    );

    const usuarios = await consultaUsuario.json();

    if (!consultaUsuario.ok) {
      throw new Error("Não foi possível consultar os acessos existentes.");
    }

    if (usuarios.length) {
      return res.status(409).json({
        sucesso: false,
        erro: "Este e-mail já possui cadastro no portal."
      });
    }

    // Cria a conta no Supabase Authentication.
    const respostaAuth = await fetch(
      `${url}/auth/v1/admin/users`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password: senhaInicial,
          email_confirm: true,
          user_metadata: {
            nome: cliente.nome,
            empresa: cliente.empresa
          }
        })
      }
    );

    const usuarioAuth = await respostaAuth.json();

    if (!respostaAuth.ok || !usuarioAuth.id) {
      console.error("Erro ao criar usuário de autenticação:", {
        status: respostaAuth.status,
        mensagem: usuarioAuth.msg || usuarioAuth.message || usuarioAuth.code
      });

      return res.status(502).json({
        sucesso: false,
        erro: "Não foi possível criar a conta. Verifique se este e-mail já possui uma conta no Supabase."
      });
    }

    usuarioCriadoId = usuarioAuth.id;

    // Vincula a conta à empresa.
    const respostaVinculo = await fetch(
      `${url}/rest/v1/usuarios_portal`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          id: usuarioAuth.id,
          nome: cliente.nome,
          empresa: cliente.empresa,
          email,
          ativo: true,
          cliente_id: cliente.id
        })
      }
    );

    const vinculo = await respostaVinculo.json();

    if (!respostaVinculo.ok) {
      // Remove a conta criada se o vínculo falhar.
      await fetch(
        `${url}/auth/v1/admin/users/${usuarioCriadoId}`,
        {
          method: "DELETE",
          headers
        }
      );

      usuarioCriadoId = null;

      console.error("Erro ao vincular usuário ao cliente:", vinculo);

      return res.status(502).json({
        sucesso: false,
        erro: "A conta não pôde ser vinculada ao cliente. Nenhum acesso foi liberado."
      });
    }

    return res.status(201).json({
      sucesso: true,
      mensagem: "Acesso ao portal criado com sucesso.",
      usuario: {
        nome: cliente.nome,
        empresa: cliente.empresa,
        email,
        cliente_id: cliente.id
      }
    });

  } catch (erro) {
    console.error("Erro na API de acesso ao portal:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao criar o acesso."
    });
  }
};
