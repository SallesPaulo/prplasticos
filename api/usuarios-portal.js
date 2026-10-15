
module.exports = async function handler(req, res) {
  const crypto = require("crypto");

  const {
    SUPABASE_URL,
    CHAVE_SECRETA_SUPABASE,
    PAINEL_EMAIL,
    PAINEL_SENHA,
    SEGREDO_DO_PAINEL
  } = process.env;

  if (!SUPABASE_URL || !CHAVE_SECRETA_SUPABASE) {
    return res.status(500).json({
      erro: "Configuração do Supabase ausente."
    });
  }

  function hashSessao() {
    return crypto
      .createHash("sha256")
      .update(PAINEL_EMAIL + PAINEL_SENHA + SEGREDO_DO_PAINEL)
      .digest("hex");
  }

  function autorizado() {
    const cookies = (req.headers.cookie || "")
      .split(";")
      .reduce((acc, item) => {
        const partes = item.trim().split("=");
        acc[partes.shift()] = partes.join("=");
        return acc;
      }, {});

    const token = cookies.painel_token || "";

    return token.length === 64 &&
      crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(hashSessao())
      );
  }

  if (!autorizado()) {
    return res.status(401).json({
      erro: "Sessão inválida. Entre novamente no painel."
    });
  }

  const base = SUPABASE_URL.replace(/\/$/, "");
  const headers = {
    apikey: CHAVE_SECRETA_SUPABASE,
    Authorization: `Bearer ${CHAVE_SECRETA_SUPABASE}`,
    "Content-Type": "application/json"
  };

  try {
    if (req.method === "GET") {
      const resposta = await fetch(
        `${base}/rest/v1/usuarios_portal?select=id,nome,empresa,email,ativo,criado_em,cliente_id&order=criado_em.desc`,
        { headers }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        return res.status(400).json({
          erro: "Erro ao consultar acessos.",
          detalhes: dados
        });
      }
      return res.status(200).json({
  sucesso: true,
  usuarios: dados
});

      return res.status(200).json({
  sucesso: true,
  usuarios: dados
});

    if (req.method === "POST") {
      const { nome, empresa, email, senha, cliente_id } = req.body || {};

      if (!nome || !empresa || !email || !senha || !cliente_id) {
        return res.status(400).json({
          erro: "Preencha nome, empresa, e-mail, senha e cliente."
        });
      }

      if (senha.length < 8) {
        return res.status(400).json({
          erro: "A senha inicial deve ter pelo menos 8 caracteres."
        });
      }

      const criar = await fetch(`${base}/auth/v1/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: {
            nome,
            empresa,
            cliente_id
          }
        })
      });

      const usuario = await criar.json();

      if (!criar.ok) {
        return res.status(400).json({
          erro: "Não foi possível criar o usuário no Supabase Auth.",
          detalhes: usuario
        });
      }

      const salvar = await fetch(
        `${base}/rest/v1/usuarios_portal`,
        {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            id: usuario.id,
            nome,
            empresa,
            email,
            ativo: true,
            cliente_id
          })
        }
      );

      const resultado = await salvar.json();

      if (!salvar.ok) {
        await fetch(
          `${base}/auth/v1/admin/users/${usuario.id}`,
          {
            method: "DELETE",
            headers
          }
        );

        return res.status(400).json({
          erro: "Não foi possível salvar o acesso na tabela usuarios_portal.",
          detalhes: resultado
        });
      }

      return res.status(201).json({
        sucesso: true,
        usuario: resultado[0]
      });
    }

    if (req.method === "PATCH") {
      const { id, ativo } = req.body || {};

      if (!id || typeof ativo !== "boolean") {
        return res.status(400).json({
          erro: "Informe o ID e o status ativo (true ou false)."
        });
      }

      const resposta = await fetch(
        `${base}/rest/v1/usuarios_portal?id=eq.${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: {
            ...headers,
            Prefer: "return=representation"
          },
          body: JSON.stringify({ ativo })
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        return res.status(400).json({
          erro: "Não foi possível atualizar o acesso.",
          detalhes: dados
        });
      }

      return res.status(200).json({
        sucesso: true,
        usuarios: dados
      });
    }

    return res.status(405).json({
      erro: "Método não permitido."
    });

  } catch (erro) {
    console.error("Erro na API usuarios-portal:", erro);

    return res.status(500).json({
      erro: "Erro interno ao processar o acesso."
    });
  }
}
