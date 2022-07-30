import AffiliateModule from './Affiliates'
import ChatModule from './Chat'
import CoinflipModule from './Coinflip'
import CryptoModule from './Crypto'
import PromoModule from './Promos'
import DiscordModule from './Discord'
import ItemsModule from './ItemStore'
import JackpotModule from './Jackpot'
import LeaderboardModule from './Leaderboard'
import ProvablyModule from './Provably'
import RouletteModule from './Roulette'
import SettingsModule from './Settings'
import SilverJackpotModule from './SilverJackpot'
import SteamModule from './Steam'
import TestModule from './Test'
import UserModule from './User'
import WaxModule from './WaxPeer'
import CoinPartyModule from './CoinParty'
import CaptchaModule from './Captcha'
import RewardModule from './Rewards'
import RustySellModule from './RustySell'
import SkinsBackModule from './Skinsback'

export default function(io) {
  const Steam = new SteamModule()
  const Provably = new ProvablyModule()
  const Settings = new SettingsModule(io)
  const Affiliate = new AffiliateModule(io, { Settings })
  const Discord = new DiscordModule({})
  const Roulette = new RouletteModule(io, { Provably, Affiliate, Settings, Discord })
  const Jackpot = new JackpotModule(io, { Provably, Affiliate, Settings, Discord })
  const SilverJackpot = new SilverJackpotModule(io, { Provably, Affiliate, Settings, Discord })
  const Coinflip = new CoinflipModule(io, { Settings, Provably, Affiliate, Discord })
  const Test = new TestModule({ Jackpot, SilverJackpot, Coinflip, Roulette: {} })
  const Crypto = new CryptoModule(io, { Settings })
  const Chat = new ChatModule(io, { Settings })
  const User = new UserModule({ Jackpot, SilverJackpot, Crypto })
  const Wax = new WaxModule(io)
  const Items = new ItemsModule(Crypto, Settings, io, Wax, Discord)
  const Leaderboard = new LeaderboardModule({ Settings })
  const CoinParty = new CoinPartyModule(io, { Settings, Chat })
  const Promo = new PromoModule(io, { Settings })
  const Captcha = new CaptchaModule()
  const Rewards = new RewardModule(io, { Settings })
  const RustySell = new RustySellModule(io)
  const SkinsBack = new SkinsBackModule(io, { Settings })

  return {
    Steam,
    Provably,
    Settings,
    Affiliate,
    Discord,
    Roulette,
    Jackpot,
    SilverJackpot,
    Coinflip,
    Test,
    Chat,
    User,
    Wax,
    Crypto,
    Items,
    Leaderboard,
    CoinParty,
    Promo,
    Captcha,
    Rewards,
    RustySell,
    SkinsBack,
  }
}
