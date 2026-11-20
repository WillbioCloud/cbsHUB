import React, { useState, useEffect, useMemo } from 'react';
import {
  Smile,
  Search,
  Clock,
  Gamepad2,
  Coffee,
  Sparkles,
  Hand,
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';

export interface EmojiData {
  emoji: string;
  name: string;
  keywords: string[];
}

const EMOJI_CATEGORIES: Record<string, { label: string; icon: React.ReactNode; emojis: EmojiData[] }> = {
  rostos: {
    label: 'Rostos',
    icon: <Smile className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '😀', name: 'sorriso', keywords: ['smile', 'happy', 'feliz', 'alegre'] },
      { emoji: '😃', name: 'sorriso aberto', keywords: ['smile', 'happy', 'alegria'] },
      { emoji: '😄', name: 'sorriso feliz', keywords: ['laugh', 'eyes', 'contente'] },
      { emoji: '😁', name: 'sorriso dentes', keywords: ['grin', 'dentes', 'orgulhoso'] },
      { emoji: '😆', name: 'gargalhada', keywords: ['laugh', 'rir', 'engraçado'] },
      { emoji: '😅', name: 'suor frio', keywords: ['sweat', 'nervous', 'tenso'] },
      { emoji: '😂', name: 'rindo até chorar', keywords: ['joy', 'tears', 'lol', 'chorando de rir', 'haha'] },
      { emoji: '🤣', name: 'rolando de rir', keywords: ['rofl', 'lmao', 'morrendo de rir'] },
      { emoji: '😊', name: 'vergonha feliz', keywords: ['blush', 'timido', 'fofo'] },
      { emoji: '😇', name: 'anjo inocente', keywords: ['angel', 'santo', 'inocente'] },
      { emoji: '🙂', name: 'sorriso leve', keywords: ['mild', 'ironico', 'ok'] },
      { emoji: '🙃', name: 'de ponta cabeça', keywords: ['upside', 'sarcasmo', 'ironia'] },
      { emoji: '😉', name: 'piscadela', keywords: ['wink', 'cumplice', 'flerte'] },
      { emoji: '😌', name: 'aliviado', keywords: ['relieved', 'paz', 'tranquilo'] },
      { emoji: '😍', name: 'olhos de coração', keywords: ['love', 'heart', 'apaixonado', 'amei'] },
      { emoji: '🥰', name: 'rosto apaixonado', keywords: ['love', 'adoravel', 'carinho'] },
      { emoji: '😘', name: 'beijo coração', keywords: ['kiss', 'beijo', 'amor'] },
      { emoji: '😋', name: 'delícia', keywords: ['yum', 'gostoso', 'comida', 'delicioso'] },
      { emoji: '😛', name: 'língua fora', keywords: ['tongue', 'bobo', 'zoeira'] },
      { emoji: '😜', name: 'língua piscando', keywords: ['crazy', 'zoeira', 'louco'] },
      { emoji: '🤪', name: 'maluco zoeiro', keywords: ['zany', 'doido', 'insano'] },
      { emoji: '😝', name: 'língua fechada', keywords: ['prank', 'pegadinha'] },
      { emoji: '🤑', name: 'rico dinheiro', keywords: ['money', 'dinheiro', 'dolar', 'pix'] },
      { emoji: '🤗', name: 'abraço', keywords: ['hug', 'abraco', 'acolhedor'] },
      { emoji: '🤫', name: 'silêncio segredo', keywords: ['shh', 'quiet', 'calado', 'segredo'] },
      { emoji: '🤔', name: 'pensando', keywords: ['think', 'duvida', 'pensativo', 'hmm'] },
      { emoji: '🤐', name: 'boca fechada', keywords: ['zipper', 'bico calado'] },
      { emoji: '🤨', name: 'sobrancelha suspeita', keywords: ['suspicious', 'duvida', 'estranho'] },
      { emoji: '😐', name: 'neutro sério', keywords: ['neutral', 'indiferente', 'sem graca'] },
      { emoji: '😑', name: 'inexpressivo', keywords: ['expressionless', 'paciencia'] },
      { emoji: '😶', name: 'sem boca', keywords: ['mute', 'mudo', 'sem palavras'] },
      { emoji: '😏', name: 'sorriso malicioso', keywords: ['smirk', 'malicia', 'safado'] },
      { emoji: '😒', name: 'desanimado desdém', keywords: ['unamused', 'saco cheio'] },
      { emoji: '🙄', name: 'revirando olhos', keywords: ['eyes roll', 'preguica', 'de novo'] },
      { emoji: '😬', name: 'careta desconforto', keywords: ['grimace', 'climão', 'eita'] },
      { emoji: '🤥', name: 'mentiroso pinóquio', keywords: ['liar', 'mentira', 'fake'] },
      { emoji: '😴', name: 'dormindo sono', keywords: ['sleep', 'cansado', 'sonolento'] },
      { emoji: '😷', name: 'máscara doente', keywords: ['mask', 'doente', 'gripe'] },
      { emoji: '🤒', name: 'termômetro febre', keywords: ['fever', 'febre', 'mal'] },
      { emoji: '🤕', name: 'machucado curativo', keywords: ['hurt', 'ferido', 'dor'] },
      { emoji: '🤢', name: 'enjoado nojo', keywords: ['sick', 'vomito', 'nojo'] },
      { emoji: '🤮', name: 'vomitando', keywords: ['barf', 'puke', 'nojento'] },
      { emoji: '🥵', name: 'calor pegando fogo', keywords: ['hot', 'calor', 'suando'] },
      { emoji: '🥶', name: 'frio congelando', keywords: ['cold', 'gelado', 'inverno'] },
      { emoji: '🥴', name: 'bêbado tonto', keywords: ['drunk', 'tonto', 'bebado'] },
      { emoji: '😵', name: 'tonto zonzo', keywords: ['dizzy', 'desmaiado'] },
      { emoji: '🤯', name: 'mente explodindo', keywords: ['mind blown', 'chocado', 'explodiu'] },
      { emoji: '🤠', name: 'cowboy chapéu', keywords: ['cowboy', 'xerife'] },
      { emoji: '🥳', name: 'comemorando festa', keywords: ['party', 'parabens', 'aniversario'] },
      { emoji: '😎', name: 'óculos escuros estilo', keywords: ['cool', 'estiloso', 'mito', 'brabo'] },
      { emoji: '🤓', name: 'nerd óculos', keywords: ['nerd', 'geek', 'estudioso'] },
      { emoji: '🧐', name: 'monóculo detetive', keywords: ['investigando', 'olha isso'] },
      { emoji: '😕', name: 'confuso', keywords: ['confused', 'perdido'] },
      { emoji: '😟', name: 'preocupado', keywords: ['worried', 'tenso'] },
      { emoji: '😮', name: 'boca aberta uau', keywords: ['wow', 'surpreso'] },
      { emoji: '😲', name: 'chocado espanto', keywords: ['astonished', 'caramba'] },
      { emoji: '😳', name: 'envergonhado corado', keywords: ['flushed', 'vergonha', 'timido'] },
      { emoji: '🥺', name: 'olhos pidões por favor', keywords: ['pleading', 'por favor', 'fofinho'] },
      { emoji: '😦', name: 'triste boca aberta', keywords: ['frown', 'tristeza'] },
      { emoji: '😨', name: 'medo apavorado', keywords: ['scared', 'medo'] },
      { emoji: '😰', name: 'ansioso preocupado', keywords: ['anxious', 'ansiedade'] },
      { emoji: '😥', name: 'triste alívio', keywords: ['sad', 'bad'] },
      { emoji: '😢', name: 'lágrima chorando', keywords: ['cry', 'triste', 'choro'] },
      { emoji: '😭', name: 'pranto desespero', keywords: ['sob', 'choradeira', 'bad'] },
      { emoji: '😱', name: 'grito pânico', keywords: ['scream', 'panico', 'socorro'] },
      { emoji: '😤', name: 'furioso fumaça', keywords: ['triumph', 'bravo', 'raiva'] },
      { emoji: '😡', name: 'bravo irritado', keywords: ['rage', 'odio', 'raiva'] },
      { emoji: '🤬', name: 'xingamento palavrão', keywords: ['cursing', 'xingando', 'puto'] },
      { emoji: '😈', name: 'diabinho sorridente', keywords: ['devil', 'maldoso', 'vilao'] },
      { emoji: '💀', name: 'caveira morto', keywords: ['skull', 'dead', 'morri', 'faleci'] },
      { emoji: '☠️', name: 'veneno caveira', keywords: ['poison', 'pirata'] },
      { emoji: '💩', name: 'cocô fofo', keywords: ['poop', 'merda'] },
      { emoji: '🤡', name: 'palhaço piada', keywords: ['clown', 'otario', 'palhaco'] },
      { emoji: '👻', name: 'fantasma', keywords: ['ghost', 'boo'] },
      { emoji: '👽', name: 'alien extraterrestre', keywords: ['alien', 'et'] },
      { emoji: '🤖', name: 'robô bot', keywords: ['robot', 'bot', 'ia'] },
    ],
  },
  gestos: {
    label: 'Gestos',
    icon: <Hand className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '👍', name: 'positivo joinha', keywords: ['like', 'thumbs up', 'beleza', 'sim', 'ok'] },
      { emoji: '👎', name: 'negativo deslike', keywords: ['dislike', 'nao', 'ruim'] },
      { emoji: '👊', name: 'soco toca aqui', keywords: ['fist', 'soco', 'bro'] },
      { emoji: '✊', name: 'punho cerrado força', keywords: ['power', 'resistencia', 'luta'] },
      { emoji: '🤛', name: 'soquinho esquerda', keywords: ['fist left', 'toca aqui'] },
      { emoji: '🤜', name: 'soquinho direita', keywords: ['fist right', 'tamo junto'] },
      { emoji: '👏', name: 'palmas aplausos', keywords: ['clap', 'parabens', 'bravo'] },
      { emoji: '🙌', name: 'mãos para o alto', keywords: ['hooray', 'aleluia', 'comemora'] },
      { emoji: '👐', name: 'mãos abertas', keywords: ['open hands', 'livre'] },
      { emoji: '🤲', name: 'palmas juntas', keywords: ['dua', 'rezando'] },
      { emoji: '🤝', name: 'aperto de mão acordo', keywords: ['handshake', 'acordo', 'fechado'] },
      { emoji: '🤙', name: 'hang loose liga nós', keywords: ['shaka', 'tranquilo', 'surfe'] },
      { emoji: '🤏', name: 'pouquinho pitada', keywords: ['pinch', 'pouco', 'quase'] },
      { emoji: '✌️', name: 'paz e vitória', keywords: ['peace', 'vitoria', 'dois'] },
      { emoji: '🤞', name: 'dedos cruzados sorte', keywords: ['fingers crossed', 'sorte', 'tomara'] },
      { emoji: '🤟', name: 'te amo libras', keywords: ['love you', 'paz'] },
      { emoji: '🤘', name: 'rock n roll chifre', keywords: ['rock', 'metal', 'pedrada'] },
      { emoji: '👈', name: 'aponta esquerda', keywords: ['point left'] },
      { emoji: '👉', name: 'aponta direita', keywords: ['point right'] },
      { emoji: '👆', name: 'aponta cima', keywords: ['point up'] },
      { emoji: '👇', name: 'aponta baixo', keywords: ['point down'] },
      { emoji: '☝️', name: 'um instante', keywords: ['one', 'primeiro'] },
      { emoji: '✋', name: 'mão levantada pare', keywords: ['stop', 'alto la'] },
      { emoji: '🤚', name: 'dorso da mão', keywords: ['backhand'] },
      { emoji: '🖐️', name: 'mão aberta cinco', keywords: ['five', 'espere'] },
      { emoji: '🖖', name: 'saudação vulcana', keywords: ['spock', 'vida longa'] },
      { emoji: '👋', name: 'aceno oi tchau', keywords: ['wave', 'hello', 'bye', 'ola'] },
      { emoji: '✍️', name: 'escrevendo caneta', keywords: ['write', 'anotando'] },
      { emoji: '🤳', name: 'selfie foto', keywords: ['selfie', 'foto'] },
      { emoji: '🦾', name: 'braço biônico robô', keywords: ['bionic', 'forca'] },
      { emoji: '💪', name: 'muque força treino', keywords: ['biceps', 'forte', 'academia', 'monstro'] },
      { emoji: '🧠', name: 'cérebro inteligência', keywords: ['brain', 'mente', 'smart', 'genio'] },
      { emoji: '👀', name: 'olhos observando', keywords: ['eyes', 'olhando', 'atento', 'fiquei de olho'] },
      { emoji: '👁️', name: 'olho único', keywords: ['eye', 'vendo'] },
      { emoji: '👅', name: 'língua', keywords: ['tongue'] },
      { emoji: '👄', name: 'boca lábios', keywords: ['lips', 'labios'] },
      { emoji: '🫂', name: 'abraço pessoas', keywords: ['hugging', 'amizade'] },
      { emoji: '🧑‍💻', name: 'programador dev', keywords: ['coder', 'dev', 'codigo', 'hacker'] },
      { emoji: '🎮', name: 'videogame gamer', keywords: ['gamer', 'jogando'] },
    ],
  },
  jogos: {
    label: 'Jogos & Tech',
    icon: <Gamepad2 className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '🎮', name: 'controle videogame', keywords: ['game', 'controller', 'ps5', 'xbox', 'jogatina'] },
      { emoji: '🕹️', name: 'joystick fliperama', keywords: ['arcade', 'retro'] },
      { emoji: '🎲', name: 'dado sorte rpg', keywords: ['dice', 'rpg', 'd20'] },
      { emoji: '👾', name: 'monstro space invader', keywords: ['alien', 'pixel', 'retro'] },
      { emoji: '🎰', name: 'caça níqueis', keywords: ['casino', 'aposta'] },
      { emoji: '🎳', name: 'boliche strike', keywords: ['bowling'] },
      { emoji: '🎯', name: 'alvo na mosca', keywords: ['target', 'bullseye', 'headshot', 'acerto'] },
      { emoji: '🏆', name: 'troféu vitória', keywords: ['trophy', 'winner', 'campeao', 'vencedor'] },
      { emoji: '🥇', name: 'medalha ouro', keywords: ['first', 'primeiro', 'ouro'] },
      { emoji: '🥈', name: 'medalha prata', keywords: ['second', 'segundo', 'prata'] },
      { emoji: '🥉', name: 'medalha bronze', keywords: ['third', 'terceiro', 'bronze'] },
      { emoji: '👑', name: 'coroa rei queen', keywords: ['crown', 'king', 'rei', 'lenda'] },
      { emoji: '💻', name: 'laptop notebook', keywords: ['pc', 'computador'] },
      { emoji: '🖥️', name: 'computador monitor', keywords: ['desktop', 'setup'] },
      { emoji: '⌨️', name: 'teclado mecânico', keywords: ['keyboard'] },
      { emoji: '🖱️', name: 'mouse gamer', keywords: ['mouse'] },
      { emoji: '🎧', name: 'headset fone', keywords: ['headphones', 'headset', 'audio'] },
      { emoji: '🎤', name: 'microfone voz', keywords: ['mic', 'karaoke'] },
      { emoji: '📡', name: 'antena satélite', keywords: ['signal', 'sinal', 'p2p'] },
      { emoji: '🔋', name: 'bateria full', keywords: ['battery', 'energia'] },
      { emoji: '🔌', name: 'tomada plugue', keywords: ['plug', 'energia'] },
      { emoji: '📱', name: 'celular smartphone', keywords: ['phone', 'mobile'] },
      { emoji: '💾', name: 'disquete salvar', keywords: ['save', 'retro'] },
      { emoji: '💿', name: 'disco cd dvd', keywords: ['cd', 'midia'] },
      { emoji: '💣', name: 'bomba estouro', keywords: ['bomb', 'kaboom'] },
      { emoji: '⚔️', name: 'espadas duelo pvp', keywords: ['swords', 'pvp', 'luta', 'duelo'] },
      { emoji: '🛡️', name: 'escudo defesa', keywords: ['shield', 'defesa', 'tank'] },
      { emoji: '🏹', name: 'arco flecha', keywords: ['bow', 'tiro'] },
      { emoji: '🚀', name: 'foguete subindo', keywords: ['rocket', 'hype', 'voando', 'bora'] },
      { emoji: '🛸', name: 'disco voador ovni', keywords: ['ufo'] },
      { emoji: '⚡', name: 'raio trovão choque', keywords: ['lightning', 'rapido', 'eletricidade'] },
      { emoji: '💥', name: 'colisão explosão', keywords: ['boom', 'pow', 'bang'] },
      { emoji: '🔮', name: 'bola de cristal', keywords: ['magic', 'futuro'] },
      { emoji: '💎', name: 'diamante raridade', keywords: ['diamond', 'raro', 'joia'] },
    ],
  },
  comida: {
    label: 'Comida',
    icon: <Coffee className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '🍕', name: 'pizza', keywords: ['food', 'lanche', 'jantar'] },
      { emoji: '🍔', name: 'hambúrguer', keywords: ['burger', 'mcdonalds', 'lanche'] },
      { emoji: '🍟', name: 'batata frita', keywords: ['fries', 'lanche'] },
      { emoji: '🌭', name: 'cachorro quente', keywords: ['hotdog'] },
      { emoji: '🍿', name: 'pipoca cinema', keywords: ['popcorn', 'filme'] },
      { emoji: '🧀', name: 'queijo', keywords: ['cheese'] },
      { emoji: '🍗', name: 'coxa de frango', keywords: ['chicken', 'kfc'] },
      { emoji: '🥩', name: 'carne churrasco', keywords: ['meat', 'churrasco', 'picanha'] },
      { emoji: '🥓', name: 'bacon', keywords: ['bacon', 'porco'] },
      { emoji: '🍳', name: 'ovo frito frigideira', keywords: ['egg', 'cafe'] },
      { emoji: '🥞', name: 'panqueca', keywords: ['pancakes'] },
      { emoji: '🍜', name: 'ramen macarrão', keywords: ['noodles', 'miojo'] },
      { emoji: '🍣', name: 'sushi japonês', keywords: ['sushi', 'japones'] },
      { emoji: '🍦', name: 'sorvete casquinha', keywords: ['ice cream', 'doce'] },
      { emoji: '🍩', name: 'donuts rosquinha', keywords: ['donut', 'doce'] },
      { emoji: '🍪', name: 'cookie biscoito', keywords: ['cookie', 'doce'] },
      { emoji: '🎂', name: 'bolo aniversário', keywords: ['cake', 'parabens'] },
      { emoji: '🍫', name: 'chocolate', keywords: ['chocolate', 'doce'] },
      { emoji: '☕', name: 'café quentinho', keywords: ['coffee', 'cafe', 'manha', 'energia'] },
      { emoji: '🍺', name: 'cerveja chopp', keywords: ['beer', 'breja', 'gelada'] },
      { emoji: '🍻', name: 'brinde cervejas', keywords: ['cheers', 'sextou', 'churrasco'] },
      { emoji: '🥂', name: 'brinde champanhe', keywords: ['celebration', 'brinde'] },
      { emoji: '🍷', name: 'vinho taça', keywords: ['wine'] },
      { emoji: '🥤', name: 'copo com canudo', keywords: ['refri', 'soda', 'suco'] },
    ],
  },
  simbolos: {
    label: 'Símbolos',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    emojis: [
      { emoji: '🔥', name: 'fogo chama quente', keywords: ['fire', 'lit', 'brabo', 'quente', 'pesado'] },
      { emoji: '❤️', name: 'coração vermelho', keywords: ['heart', 'love', 'amor'] },
      { emoji: '🧡', name: 'coração laranja', keywords: ['orange heart'] },
      { emoji: '💛', name: 'coração amarelo', keywords: ['yellow heart'] },
      { emoji: '💚', name: 'coração verde', keywords: ['green heart'] },
      { emoji: '💙', name: 'coração azul', keywords: ['blue heart'] },
      { emoji: '💜', name: 'coração roxo', keywords: ['purple heart'] },
      { emoji: '🖤', name: 'coração preto', keywords: ['black heart'] },
      { emoji: '🤍', name: 'coração branco', keywords: ['white heart'] },
      { emoji: '💔', name: 'coração partido', keywords: ['broken heart', 'bad'] },
      { emoji: '✨', name: 'brilhos reluzente', keywords: ['sparkles', 'novo', 'clean'] },
      { emoji: '🌟', name: 'estrela brilhante', keywords: ['star', 'destaque'] },
      { emoji: '⭐', name: 'estrela favorita', keywords: ['star', 'favorito'] },
      { emoji: '💫', name: 'tontura estrela', keywords: ['dizzy', 'magia'] },
      { emoji: '💯', name: 'cem perfeito nota 10', keywords: ['hundred', 'top', 'perfeito'] },
      { emoji: '🎉', name: 'festa confetes parabéns', keywords: ['party', 'parabens', 'sucesso', 'uhu'] },
      { emoji: '🎊', name: 'confete bola', keywords: ['celebrate'] },
      { emoji: '🎈', name: 'balão bexiga', keywords: ['balloon'] },
      { emoji: '🎁', name: 'presente caixa', keywords: ['gift', 'natal'] },
      { emoji: '🎵', name: 'nota musical', keywords: ['music', 'musica'] },
      { emoji: '🎶', name: 'notas musicais melodia', keywords: ['notes', 'som'] },
      { emoji: '🔔', name: 'sino notificação', keywords: ['bell', 'aviso'] },
      { emoji: '📢', name: 'megafone anúncio', keywords: ['loudspeaker', 'comunicado'] },
      { emoji: '🚨', name: 'sirene polícia alerta', keywords: ['police', 'alerta', 'urgente'] },
      { emoji: '⚠️', name: 'aviso perigo atenção', keywords: ['warning', 'cuidado'] },
      { emoji: '🛑', name: 'pare placa stop', keywords: ['stop', 'pare'] },
      { emoji: '💬', name: 'balão de fala', keywords: ['chat', 'conversa'] },
      { emoji: '💭', name: 'balão de pensamento', keywords: ['thought'] },
      { emoji: '💤', name: 'zzz sono', keywords: ['sleep', 'dormindo'] },
      { emoji: '🚩', name: 'bandeira vermelha alerta', keywords: ['red flag', 'alerta'] },
      { emoji: '🆗', name: 'ok botão', keywords: ['ok'] },
    ],
  },
};

const DEFAULT_RECENTS = ['😂', '🔥', '👍', '❤️', '🚀', '💀', '🎉', '👀'];

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: string) => void;
  trigger?: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export const EmojiPickerPopover: React.FC<EmojiPickerPopoverProps> = ({
  onSelectEmoji,
  trigger,
  side = 'top',
  align = 'end',
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  className,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setIsOpen = isControlled ? setControlledOpen! : setUncontrolledOpen;

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('rostos');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cbshub-recent-emojis');
      return saved ? JSON.parse(saved) : DEFAULT_RECENTS;
    } catch {
      return DEFAULT_RECENTS;
    }
  });

  const handlePick = (emoji: string) => {
    // Atualiza recentes no localStorage
    const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 16);
    setRecentEmojis(updated);
    try {
      localStorage.setItem('cbshub-recent-emojis', JSON.stringify(updated));
    } catch {
      /* ignore */
    }

    onSelectEmoji(emoji);
    setIsOpen(false);
    setSearch('');
  };

  // Flattened emoji search
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const results: EmojiData[] = [];
    for (const cat of Object.values(EMOJI_CATEGORIES)) {
      for (const item of cat.emojis) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.keywords.some((k) => k.toLowerCase().includes(q))
        ) {
          if (!results.some((r) => r.emoji === item.emoji)) {
            results.push(item);
          }
        }
      }
    }
    return results;
  }, [search]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent
        side={side}
        align={align}
        className={`w-80 p-3 bg-popover border-border text-popover-foreground shadow-2xl rounded-2xl select-none ${className || ''}`}
      >
        {/* Campo de Busca */}
        <div className="relative mb-2.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar emoji..."
            className="h-8 pl-8 text-xs bg-secondary/80 border-border/80 focus-visible:ring-1 focus-visible:ring-primary rounded-lg"
          />
        </div>

        {/* Modo de Busca Ativo */}
        {search.trim().length > 0 ? (
          <ScrollArea className="h-56 pr-1">
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-8 gap-1 p-1">
                {searchResults.map((item) => (
                  <button
                    key={item.emoji}
                    onClick={() => handlePick(item.emoji)}
                    title={item.name}
                    className="h-8 w-8 rounded-md hover:bg-accent/80 hover:scale-110 active:scale-95 transition-transform flex items-center justify-center text-lg cursor-pointer"
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-center text-xs text-muted-foreground p-4">
                <span>Nenhum emoji encontrado para "{search}"</span>
              </div>
            )}
          </ScrollArea>
        ) : (
          /* Modo Categorias com Tabs */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-6 h-8 bg-secondary/60 p-0.5 rounded-lg mb-2">
              <TabsTrigger value="recentes" title="Recentes" className="h-7 p-0 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </TabsTrigger>
              <TabsTrigger value="rostos" title="Rostos & Emoções" className="h-7 p-0 flex items-center justify-center">
                <Smile className="w-3.5 h-3.5" />
              </TabsTrigger>
              <TabsTrigger value="gestos" title="Gestos & Pessoas" className="h-7 p-0 flex items-center justify-center">
                <Hand className="w-3.5 h-3.5" />
              </TabsTrigger>
              <TabsTrigger value="jogos" title="Jogos & Tech" className="h-7 p-0 flex items-center justify-center">
                <Gamepad2 className="w-3.5 h-3.5" />
              </TabsTrigger>
              <TabsTrigger value="comida" title="Comida & Bebida" className="h-7 p-0 flex items-center justify-center">
                <Coffee className="w-3.5 h-3.5" />
              </TabsTrigger>
              <TabsTrigger value="simbolos" title="Símbolos & Festas" className="h-7 p-0 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-56 pr-1">
              <TabsContent value="recentes" className="mt-0 p-1">
                <div className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                  Recentes
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {recentEmojis.map((emoji, idx) => (
                    <button
                      key={`${emoji}-${idx}`}
                      onClick={() => handlePick(emoji)}
                      className="h-8 w-8 rounded-md hover:bg-accent/80 hover:scale-110 active:scale-95 transition-transform flex items-center justify-center text-lg cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </TabsContent>

              {Object.entries(EMOJI_CATEGORIES).map(([catKey, cat]) => (
                <TabsContent key={catKey} value={catKey} className="mt-0 p-1">
                  <div className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                    {cat.label}
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {cat.emojis.map((item) => (
                      <button
                        key={item.emoji}
                        onClick={() => handlePick(item.emoji)}
                        title={item.name}
                        className="h-8 w-8 rounded-md hover:bg-accent/80 hover:scale-110 active:scale-95 transition-transform flex items-center justify-center text-lg cursor-pointer"
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </ScrollArea>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
};
