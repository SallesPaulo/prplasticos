
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      sucesso: false,
      erro: 'Método não permitido.'
    });
  }

  const cidade = String(req.query.cidade || '').trim();
  const uf = String(req.query.uf || '').trim();

  if (!cidade) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Informe a cidade.'
    });
  }

  try {
    const consulta = new URLSearchParams({
      q: `${cidade}${uf ? ', ' + uf : ''}, Brasil`,
      format: 'jsonv2',
      countrycodes: 'br',
      limit: '1'
    });

    const resposta = await fetch(
      `https://nominatim.openstreetmap.org/search?${consulta}`,
      {
        headers: {
          'User-Agent': 'PRPlasticosPainel/1.0 (comercial@prplasticos.com.br)',
          'Accept-Language': 'pt-BR'
        }
      }
    );

    if (!resposta.ok) {
      return res.status(502).json({
        sucesso: false,
        erro: 'O serviço de localização está indisponível.'
      });
    }

    const resultados = await resposta.json();

    if (!resultados.length) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Cidade não encontrada.'
      });
    }

    return res.status(200).json({
      sucesso: true,
      cidade,
      uf,
      lat: Number(resultados[0].lat),
      lon: Number(resultados[0].lon)
    });
  } catch (erro) {
    console.error('Erro ao localizar cidade:', erro);

    return res.status(500).json({
      sucesso: false,
      erro: 'Erro ao consultar a localização.'
    });
  }
};
