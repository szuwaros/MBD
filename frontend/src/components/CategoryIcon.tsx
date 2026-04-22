import {
  ShoppingCart, Droplets, Wine, Sparkles, PawPrint, Camera, Globe, Gift,
  Fuel, Bus, CarFront, Wrench, Cog, Car, Plane,
  Home, CreditCard, Hammer, Tv, Flower2,
  Zap, Flame, Droplet, Wifi, MonitorPlay, Shield, Receipt,
  Pill, Stethoscope, HeartPulse,
  UtensilsCrossed, Clapperboard, Dumbbell, Palette, Palmtree, Hotel,
  GraduationCap, BookOpen, Notebook,
  Baby, ToyBrick, Backpack,
  Shirt, Footprints, Watch,
  Landmark, PiggyBank, Building2, Banknote,
  Wallet, Briefcase, ArrowLeftRight, RotateCcw, TrendingUp, BadgeDollarSign,
  CircleDot, Newspaper, Gamepad2, Beer, Scissors,
  type LucideIcon,
} from 'lucide-react';

// Map category names (lowercased keywords) to Lucide icons
const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  // Wydatki bieżące
  [/spożyw/i, ShoppingCart],
  [/chemia|środki czyst|higiena/i, Droplets],
  [/alkohol/i, Wine],
  [/kosmetyk/i, Sparkles],
  [/uroda|fryzjer|kosmetyczk/i, Scissors],
  [/zwierzęt/i, PawPrint],
  [/fotografi/i, Camera],
  [/zakupy.*internet/i, Globe],
  [/prezent|upomink/i, Gift],
  [/gazet|czasopis/i, Newspaper],
  [/multimedia/i, Gamepad2],
  // Transport
  [/paliwo/i, Fuel],
  [/transport.*publicz/i, Bus],
  [/myjnia|przegląd|napraw/i, Wrench],
  [/części|akcesoria.*sam/i, Cog],
  [/taxi/i, Car],
  [/bilet.*lotn/i, Plane],
  [/transport/i, CarFront],
  // Dom i mieszkanie
  [/czynsz|wynajem/i, Home],
  [/kredyt.*hipot/i, CreditCard],
  [/remont|wyposażen/i, Hammer],
  [/agd|rtv/i, Tv],
  [/ogród/i, Flower2],
  // Rachunki i opłaty
  [/prąd/i, Zap],
  [/gaz\b/i, Flame],
  [/woda\b/i, Droplet],
  [/internet.*tel|tv.*tel/i, Wifi],
  [/telewizj|stream/i, MonitorPlay],
  [/ubezpiecz/i, Shield],
  [/opłat/i, Receipt],
  [/podatk/i, Landmark],
  // Zdrowie
  [/lek[ia]|aptek/i, Pill],
  [/wizyt.*lekar|opieka med/i, Stethoscope],
  [/stomatolog|okulist|zdrowie|akcesor.*med/i, HeartPulse],
  // Rozrywka i wypoczynek
  [/restaurac|kawiar/i, UtensilsCrossed],
  [/kino|teatr|koncert/i, Clapperboard],
  [/sport|fitness/i, Dumbbell],
  [/hobby/i, Palette],
  [/wakacj|podróż/i, Palmtree],
  [/hotel|nocleg/i, Hotel],
  [/rozrywk/i, Clapperboard],
  [/pub|klub/i, Beer],
  // Edukacja
  [/szkoł|przedszk|czesne/i, GraduationCap],
  [/kurs|szkolen/i, Notebook],
  [/książk|materiał/i, BookOpen],
  // Dzieci
  [/dziec/i, Baby],
  [/zabawk/i, ToyBrick],
  [/artykuł.*szkoln/i, Backpack],
  // Odzież i obuwie
  [/odzież|ubrani/i, Shirt],
  [/obuwie/i, Footprints],
  [/dodatki|akcesor/i, Watch],
  // Finanse
  [/spłata|kredyt|pożyczk/i, CreditCard],
  [/oszczędn|inwestycj/i, PiggyBank],
  [/opłaty bank|bankoma|wypłata/i, Building2],
  [/przelew/i, ArrowLeftRight],
  // Przychody
  [/wynagrodzen/i, Wallet],
  [/premi|nagrod/i, BadgeDollarSign],
  [/emeryt|rent/i, Briefcase],
  [/zwrot/i, RotateCcw],
  [/odsetk|inwestycj/i, TrendingUp],
  [/sprzedaż/i, Banknote],
  [/wpływ|przychod/i, Wallet],
];

// Group-level icons
const GROUP_ICONS: Record<string, LucideIcon> = {
  'Wydatki bieżące': ShoppingCart,
  'Transport': CarFront,
  'Dom i mieszkanie': Home,
  'Rachunki i opłaty': Receipt,
  'Zdrowie': HeartPulse,
  'Rozrywka i wypoczynek': Palmtree,
  'Edukacja': GraduationCap,
  'Dzieci': Baby,
  'Odzież i obuwie': Shirt,
  'Finanse': Landmark,
  'Przychody': Wallet,
  'Inne': CircleDot,
};

export function getCategoryIcon(name: string): LucideIcon {
  for (const [re, icon] of CATEGORY_ICONS) {
    if (re.test(name)) return icon;
  }
  return CircleDot;
}

export function getGroupIcon(groupName: string): LucideIcon {
  return GROUP_ICONS[groupName] || CircleDot;
}

interface Props {
  name: string;
  group?: boolean;
  size?: number;
  className?: string;
  color?: string;
}

export default function CategoryIcon({ name, group = false, size = 16, className = '', color }: Props) {
  const Icon = group ? getGroupIcon(name) : getCategoryIcon(name);
  return <Icon size={size} className={className} color={color} />;
}
