# -*- coding: utf-8 -*-
"""
CloudStock — Gerador de Relatório de Desenvolvimento (PDF)
Gera CloudStock_Relatorio_Desenvolvimento.pdf na raiz do projeto.
Uso: python gerar_relatorio.py
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "CloudStock_Relatorio_Desenvolvimento.pdf")

# Paleta (identidade CloudStock: azul + glass)
AZUL = HexColor("#2563eb")
AZUL_CLARO = HexColor("#3b82f6")
CINZA_TXT = HexColor("#1f2937")
CINZA_MED = HexColor("#4b5563")
CINZA_SUAVE = HexColor("#6b7280")
LINHA = HexColor("#e5e7eb")
FUNDO_CAIXA = HexColor("#f3f6ff")

# Fontes com acentuação (Arial do Windows)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
FONTS = r"C:\Windows\Fonts"
pdfmetrics.registerFont(TTFont("Arial", os.path.join(FONTS, "arial.ttf")))
pdfmetrics.registerFont(TTFont("Arial-B", os.path.join(FONTS, "arialbd.ttf")))
pdfmetrics.registerFont(TTFont("Arial-I", os.path.join(FONTS, "ariali.ttf")))

# Estilos
st_titulo = ParagraphStyle("titulo", fontName="Arial-B", fontSize=24, leading=30,
                           textColor=CINZA_TXT, alignment=TA_LEFT, spaceAfter=2)
st_sub = ParagraphStyle("sub", fontName="Arial", fontSize=11.5, leading=16,
                        textColor=CINZA_SUAVE, alignment=TA_LEFT)
st_sec = ParagraphStyle("sec", fontName="Arial-B", fontSize=15, leading=20,
                        textColor=AZUL, spaceBefore=18, spaceAfter=6)
st_subsec = ParagraphStyle("subsec", fontName="Arial-B", fontSize=11, leading=15,
                           textColor=CINZA_TXT, spaceBefore=8, spaceAfter=3)
st_corpo = ParagraphStyle("corpo", fontName="Arial", fontSize=10, leading=15,
                          textColor=CINZA_MED, alignment=TA_LEFT, spaceAfter=4)
st_bullet = ParagraphStyle("bullet", fontName="Arial", fontSize=10, leading=14.5,
                           textColor=CINZA_MED, leftIndent=14, bulletIndent=4, spaceAfter=2.5)
st_caixa = ParagraphStyle("caixa", fontName="Arial", fontSize=10, leading=15,
                          textColor=CINZA_TXT, alignment=TA_LEFT)
st_rodape = ParagraphStyle("rodape", fontName="Arial-I", fontSize=8.5, leading=11,
                           textColor=CINZA_SUAVE, alignment=TA_CENTER)


def bullets(*itens):
    return [Paragraph(f"•&nbsp;&nbsp;{i}", st_bullet) for i in itens]


def secao_caixa(titulo, linhas):
    """Caixa rotulada com pares rótulo: valor (usada no cabeçalho)."""
    dados = [[Paragraph(f"<b>{k}</b>", st_caixa), Paragraph(v, st_caixa)] for k, v in linhas]
    t = Table(dados, colWidths=[45 * mm, 110 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FUNDO_CAIXA),
        ("BOX", (0, 0), (-1, -1), 0.75, LINHA),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [Paragraph(titulo, st_subsec), t]


doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
    title="CloudStock — Relatório de Desenvolvimento",
    author="CloudStock Project",
)


def rodape_pagina(canvas, doc_):
    canvas.saveState()
    canvas.setStrokeColor(LINHA)
    canvas.setLineWidth(0.6)
    canvas.line(20 * mm, 14 * mm, 190 * mm, 14 * mm)
    canvas.setFont("Arial", 8)
    canvas.setFillColor(CINZA_SUAVE)
    canvas.drawString(20 * mm, 9.5 * mm, "CloudStock — Relatório de Desenvolvimento")
    canvas.drawRightString(190 * mm, 9.5 * mm, f"Página {doc_.page}")
    canvas.restoreState()


E = []  # elementos

# ============ CABEÇALHO / IDENTIFICAÇÃO ============
logo = Table(
    [[Paragraph('<font color="#2563eb"><b>☁ CloudStock</b></font>', st_titulo),
      Paragraph("Relatório de Desenvolvimento<br/><b>12 de Outubro de 2026</b>", st_sub)]],
    colWidths=[100 * mm, 75 * mm])
logo.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
E.append(logo)
E.append(Spacer(1, 6))
E.append(HRFlowable(width="100%", thickness=2, color=AZUL, spaceAfter=4))
E.append(HRFlowable(width="100%", thickness=0.5, color=LINHA, spaceAfter=14))

E += secao_caixa("", [
    ("Projeto", "CloudStock — Gerenciador de coleções de ROMs (local + nuvem MEGA)"),
    ("Data do relatório", "12 de Outubro de 2026"),
    ("Stack", "Tauri v2 · Svelte · Tailwind CSS · TypeScript"),
    ("Estilo Visual", "VisionOS / Nintendo Switch eShop — Glassmorphism, cards 1:1, temas claro/escuro"),
])
E.append(Spacer(1, 6))
E.append(Paragraph(
    "O CloudStock é um aplicativo desktop de biblioteca de jogos construído com Tauri v2 e Svelte, "
    "com interface inspirada no VisionOS e na Nintendo Switch eShop: cartões quadrados (1:1) em grade, "
    "superfícies translúcidas com desfoque (glassmorphism), anéis de foco suaves e dois temas completos "
    "(claro/escuro). O app suporta 12 plataformas e integração com armazenamento em nuvem.", st_corpo))

# ============ SEÇÃO 2: FUNCIONALIDADES ============
E.append(Paragraph("2. Funcionalidades e Recursos Adicionados", st_sec))

E.append(Paragraph("2.1 Grade de Jogos e Navegação", st_subsec))
E += bullets(
    "Grade responsiva de 4 colunas com cartões 1:1 (capa quadrada), foco por teclado, mouse e gamepad.",
    "Abas centrais no header: <b>Início</b> e <b>Favoritos</b>, em pílula glassmorphism com ícones por tema e "
    "indicador deslizante com animação de passada lateral (cubic-bezier 0.28s).",
    "Favoritos por jogo com estrela no cartão e persistência em <i>settings.json</i> (plugin-store do Tauri).",
    "Barra de pesquisa expandida para 50vw (metade da tela) com borda fina — branca no tema escuro, preta no claro.",
)

E.append(Paragraph("2.2 Suporte Completo a Gamepad (Gamepad API)", st_subsec))
E += bullets(
    "D-Pad e analógico esquerdo para navegação com repetição contínua e debounce de 180 ms.",
    "<b>L1/R1</b>: alternam as abas Início/Favoritos (navegação rápida entre seções).",
    "<b>Botão A</b>: confirmar/abrir; <b>Botão B</b>: voltar; <b>Botão Y</b>: favoritar/desfavoritar o card focado.",
    "<b>Start/Select</b>: abrem o menu de Configurações.",
    "Pipeline de foco em camadas: grade de jogos → botões da interface → menus/modais, sem conflitos.",
)

E.append(Paragraph("2.3 HUD e Indicadores", st_subsec))
E += bullets(
    "HUD em pílula (canto inferior direito) com mapeamento dos controles: B Voltar · L/R Abas · A Confirmar · "
    "Y Favoritar/Desfavoritar (rótulo dinâmico conforme estado do card).",
    "A dica de Favoritar desaparece automaticamente quando um botão da interface (Filtrar, Tema, Configurações) "
    "está focado — e retorna ao focar cards.",
    "Indicador de gamepad conectado no canto inferior esquerdo (55 px, vidro fosco, ícone PNG).",
    "Fade in/out sincronizado de 250 ms no HUD e no indicador ao conectar/desconectar o controle.",
)

E.append(Paragraph("2.4 Menus e Integrações de Nuvem", st_subsec))
E += bullets(
    "Menu de Configurações em vidro fosco (50% de opacidade + blur) com seções <b>MEGA</b> e <b>Google Drive</b>.",
    "Login MEGA redesenhado (glass, radius 28 px, labels Email/Senha, Enter para enviar) e seletor de pastas "
    "do MEGA com navegação hierárquica, voltar, seleção persistente e navegação por gamepad.",
    "Varredura recursiva de ROMs no MEGA com detecção de pastas de plataforma, download de metadados "
    "(<i>cloudstore.metadata.txt</i>) e capas (<i>media/box2dfront</i>) em segundo plano.",
    "Suporte a PSP com extensões <b>.iso, .cso, .pbp, .chd, .dax, .jso, .rar, .zip, .7z</b> e reconhecimento de "
    "N64 com <b>.rom</b> (além de .z64/.n64/.v64).",
)

# ============ SEÇÃO 3: CORREÇÕES UI/UX ============
E.append(Paragraph("3. Correções e Refinamentos UI/UX", st_sec))
E += bullets(
    "<b>Espaçamento geral:</b> padding e max-width ajustados para evitar encosto nas bordas da janela.",
    "<b>Ícones personalizados:</b> emojis substituídos por PNGs em <i>assets/icons</i>, com variantes clara/escura "
    "e troca reativa de tema ({#key}) — corrige atraso de repintura no WebView2.",
    "<b>FABs (botões flutuantes):</b> ajustes de opacidade, tamanho e sombras para hierarquia visual consistente.",
    "<b>Modo claro:</b> fundo com gradiente suave (#f8f8f8), elevando contraste e conforto visual.",
    "<b>Legibilidade:</b> legenda “Todas as ROMs” refinada (peso/contraste) no cabeçalho da grade.",
    "<b>Capas PSP:</b> leitura de capas em <i>media/box2dfront</i> com correspondência pelo nome do arquivo.",
    "<b>Tela de carregamento:</b> logos redimensionados e animação de pontos piscantes durante o load.",
)

# ============ SEÇÃO 4: GUIA DE CONTEXTO ============
E.append(Paragraph("4. Guia de Contexto para a Próxima Sessão", st_sec))

E.append(Paragraph("4.1 Diretrizes Estéticas Vigentes", st_subsec))
E += bullets(
    "Glassmorphism em toda a interface: superfícies <i>rgba(0,0,0,0.3)</i> + <i>blur(12px)</i>, bordas "
    "<i>rgba(255,255,255,0.1)</i>; no tema claro, equivalentes escuros sobre fundo #f8f8f8.",
    "Cartões sempre 1:1 em grade de 4 colunas; anel de foco branco (escuro) / preto (claro) para gamepad.",
    "Ícones sempre em PNG com par de variantes (branco/preto) e {#key isDark} para recriar nós ao alternar tema.",
    "Transições padrão: fly (pesquisa/filtro), fade 180 ms (modais) e fade 250 ms (HUD/indicador).",
)

E.append(Paragraph("4.2 Status das Integrações", st_subsec))
tabela = Table([
    [Paragraph("<b>Integração</b>", st_caixa), Paragraph("<b>Status</b>", st_caixa),
     Paragraph("<b>Observações</b>", st_caixa)],
    [Paragraph("MEGA (megajs)", st_caixa), Paragraph("Parcial — login e varredura operacionais", st_caixa),
     Paragraph("Login, navegação de pastas, metadados e capas funcionando; sincronização local↔nuvem em evolução", st_caixa)],
    [Paragraph("Google Drive", st_caixa), Paragraph("Pendente", st_caixa),
     Paragraph("Seção existente no menu Configurações; implementação de login/scan ainda não iniciada", st_caixa)],
], colWidths=[38 * mm, 55 * mm, 62 * mm])
tabela.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.75, LINHA),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, LINHA),
    ("BACKGROUND", (0, 0), (-1, 0), FUNDO_CAIXA),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
E.append(tabela)

E.append(Spacer(1, 10))
E.append(Paragraph(
    "<b>Próximos passos sugeridos:</b> finalizar sincronização bidirecional local↔MEGA (status cloud/local por "
    "arquivo), iniciar OAuth do Google Drive replicando o fluxo do seletor de pastas do MEGA, e expandir "
    "metadados (tamanho real dos arquivos em nuvem).", st_corpo))

E.append(Spacer(1, 16))
E.append(HRFlowable(width="100%", thickness=0.5, color=LINHA, spaceAfter=4))
E.append(Paragraph("Documento gerado automaticamente — CloudStock Project · 12/10/2026", st_rodape))

doc.build(E, onFirstPage=rodape_pagina, onLaterPages=rodape_pagina)
print(f"PDF gerado com sucesso: {OUT}")
