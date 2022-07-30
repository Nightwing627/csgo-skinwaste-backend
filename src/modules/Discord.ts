import { MessageEmbed, WebhookClient, Client, TextChannel } from 'discord.js'
import config from 'config'
import { ERROR } from '../constants/Errors'
import BaseService from './BaseService'
import Transaction, { ETransactionState } from '../models/Transaction'

const Webhooks = {
  Error: new WebhookClient(
    '895243554740387850',
    'zQsCVICKnDjJAsm5BImI2fky8ysyZHy3dPvGRD2zOLfRllJeh9i2GnZiHKMnU9FgKQqW'
  ),
  Deposit: new WebhookClient(
    '895244417210929172',
    'AbifueOSp3nrfFW-otDc39crBfu0qwyTL_Rry5_e3qx47ZppqeWZ7kX7GBA62ItQ7VA9'
  ),
  Daily: new WebhookClient(
    '895244670379102238',
    'vWF5ZUPM8zP9dnFlkvXYCXg5mhSxY9sJz2TrEShLM6agTle_mnniIV0uXFuxuRDprnQK'
  ),
  Rake: new WebhookClient('895244784887824385', '4cm-8vL44tlRbjIJREY2PDyGQJsuh9ph9ilKosIFQeP9Kl-Zz4Z2MkJIPtfFVOmpaYH2'),
  Withdrawal: new WebhookClient(
    '895244888042512384',
    'qec75Ziol1MpREI0JsNc-Al32y-nS7ZUeP_3SziDs5OnAw27lj7vMTFv9MucOTtKbZi5'
  ),
  Csgo: new WebhookClient('895245024533553222', 'hxmfegWe73B68vqrP3cA9tOIxz2HnmRqF2ShiwCh-th4QuY9w_gWj6DnQC2KyhjOz6yx'),
  WithdrawalApprove: new WebhookClient(
    '895245164535226370',
    'ME7N4vCxyIcbR0Ge5c6ndRAhaXlhSLPCEkicCrY4xVt8PWjByaA23wj2t4J94y0cjLJ4'
  ),
  Roulette: new WebhookClient(
    '895253151526051840',
    'Sb61lvYD2sIQOp4RAqyKrRqGyycugRcUOvin_qRTuWoQsl2MUU4oAQwPsNOGQ0M7F2Gs'
  ),
  Coinflip: new WebhookClient(
    '895254430834884629',
    'TxW5SFGdkwWP7F3WBD3qZRfaSgO0mzq79I9H_bIZgfO7_rJifyMuypa6SaDv0g1sEETI'
  ),
  Jackpot: new WebhookClient(
    '895254907341393920',
    'aNKyHkN--vg2LAQJJsVmnmBqBct8TETMZuWK6PKn2_WsyIDV7gFA9CfBGzBBoYv2mKEy'
  ),
  Test: new WebhookClient('895245290351755314', 'nRbv2YYugMIpGn8aNfN_1yK-s1PxM3Te9ojoDFnvr1-mk5cE76CgjqEtiDdYqQ8ni9tt'),
}

const PING_NAMES = {
  admins: '<@&895242705637081128>',
  data: '<@&895247047794511882>',
  support: '<@&895246379000152075>',
  devs: '<@&895246730776432672>',
}

const COLORS = {
  Error: 16058376,
  Deposit: 390473,
  Rake: 390473,
  Daily: 390473,
  Blue: 51711,
}

const CHANNELS = { withdrawalApprovals: '690766601020112948', test: '895245290351755314' }

export default class Discord extends BaseService {
  Client: Client
  Crypto: any
  Items: any
  constructor({ Crypto = null, ItemM = null }) {
    super({ location: 'service/Discord' })

    this.Crypto = Crypto
    this.Items = ItemM
    this.Client = new Client()

    if (this.Crypto && this.Items) this._initClient()
  }
  _initClient() {
    this.Client.login(config.discord.botToken)

    this.Client.on('message', message => {
      if (message.content === '!ping') message.channel.send('pong mothafucka')
    })
    this.Client.once('ready', async () => {
      this.Logger.info('Discord Bot Started')
      const channel: TextChannel = this.Client.channels.cache.get(
        config.isAppProd() ? CHANNELS.withdrawalApprovals : CHANNELS.test
      ) as TextChannel

      for (const [id, message] of await channel.messages.fetch()) {
        if (!id) return
        if (message.author.id === '690769673280553011') {
          if (message.reactions) {
            message
              .awaitReactions(
                (reaction, user) => {
                  const disMessage = new MessageEmbed(message.embeds[0])
                  if (reaction.emoji.name === '✅' && !user.bot && reaction.count === 2) {
                    const { fields } = message.embeds[0]
                    if (fields[9].value === 'CSGO') {
                      this.Items.requestItemFromWAXPeer(
                        fields[0].value,
                        fields[10].value.split(','),
                        true,
                        fields[7].value
                      )
                        .then(() => {
                          message.reactions.removeAll()
                          disMessage.author.name = 'Withdrawal APPROVED'
                          disMessage.color = COLORS.Deposit
                          disMessage.addField('Approved By:', user.username)
                          message.edit('', { embed: disMessage })
                          return true
                        })
                        .catch(e => {
                          this.Logger.error(e)
                          return false
                        })
                    } else if (fields[9].value === 'ETH') {
                      this.Crypto.createWithdrawRequest(
                        fields[0].value,
                        fields[11].value,
                        parseFloat(fields[10].value.replace('$', '')) * 100,
                        fields[9].value.toLowerCase(),
                        true,
                        fields[8].value
                      )
                        .then(() => {
                          message.reactions.removeAll()
                          disMessage.author.name = 'Withdrawal APPROVED'
                          disMessage.color = COLORS.Deposit
                          disMessage.addField('Approved By:', user.username)
                          message.edit('', { embed: disMessage })
                          return true
                        })
                        .catch(e => {
                          this.Logger.error(e)
                          return false
                        })
                    }
                  }
                  if (reaction.emoji.name === '⛔' && !user.bot && reaction.count === 2) {
                    Transaction.findByIdAndUpdate(message.embeds[0].fields[8].value, {
                      status: ETransactionState.Declined,
                    })
                      .then(() => {
                        message.reactions.removeAll()
                        disMessage.author.name = 'Withdrawal DENIED'
                        disMessage.color = COLORS.Error
                        disMessage.addField('Denied By:', user.username)
                        message.edit('', { embed: disMessage })
                        return true
                      })
                      .catch(e => {
                        this.Logger.error(e)
                        return false
                      })
                  }

                  return false
                },
                { time: 60e3 * 60 * 48 }
              )
              .catch(this.Logger.error)
          }
        }
      }
      // this.sendWithdrawalApproval(
      //   {},
      //   { type: 0, currency: 'ETH', extra: { address: '0x5d13839270bb330D803083FCA1a335EC5Ad67131' } },
      // );
    })
  }

  public async sendWithdrawalApproval(userData, txData) {
    try {
      const channel: TextChannel = this.Client.channels.cache.get(
        config.isAppProd() ? CHANNELS.withdrawalApprovals : CHANNELS.test
      ) as TextChannel
      const disMessage = new MessageEmbed({
        author: { name: `Withdrawal Approval` },
        color: COLORS.Blue,
        description: '',
        timestamp: new Date(),
        thumbnail: {
          url: userData.avatar,
        },
      })

      disMessage.addFields([
        { name: 'UserID', value: userData._id, inline: true },
        { name: 'Username', value: userData.username, inline: true },
        { name: 'Bet Data', value: '----------------------------------------------------------------' },
        { name: 'Deposited', value: `$${(userData.deposited / 100).toFixed(2)}`, inline: true },
        { name: 'Withdrawn', value: `$${(userData.withdrawn / 100).toFixed(2)}`, inline: true },
        { name: 'Wagered', value: `$${(userData.wagered / 100).toFixed(2)}`, inline: true },
        { name: 'Won', value: `$${(userData.won / 100).toFixed(2)}`, inline: true },
        { name: 'Transaction Data', value: '----------------------------------------------------------------' },
      ])

      if (txData.type === 0) {
        disMessage.addFields([
          { name: 'TxId', value: txData._id, inline: true },
          { name: 'Type', value: txData.currency, inline: true },
          { name: 'Amount', value: `$${(txData.amount / 100).toFixed(2)}`, inline: true },
          { name: 'Address', value: txData?.extra?.address },
        ])
      }

      if (txData.type === 17) {
        disMessage.addFields([
          { name: 'TxId', value: txData._id, inline: true },
          { name: 'Type', value: 'CSGO', inline: true },
          { name: 'Amount', value: `$${(txData.amount / 100).toFixed(2)}`, inline: true },
          { name: 'Skin Ids', value: txData.csgoSkins.join(',') },
          { name: 'Skin Names', value: txData.extra.skins.join(',') },
        ])
      }
      // ${PING_NAMES.support} ${PING_NAMES.devs}
      const message = await channel.send(`${PING_NAMES.support} ${PING_NAMES.devs}`, { embed: disMessage })
      // prettier-ignore
      await message.react('✅');
      // prettier-ignore
      await message.react('⛔');
      message
        .awaitReactions(
          (reaction, user) => {
            if (reaction.emoji.name === '✅' && !user.bot && reaction.count === 2) {
              const { fields } = message.embeds[0]
              if (fields[9].value === 'CSGO') {
                this.Items.requestItemFromWAXPeer(fields[0].value, fields[10].value.split(','), true, fields[7].value)
                  .then(() => {
                    message.reactions.removeAll()
                    disMessage.author.name = 'Withdrawal APPROVED'
                    disMessage.color = COLORS.Deposit
                    disMessage.addField('Approved By:', user.username)
                    message.edit('', { embed: disMessage })
                    return true
                  })
                  .catch(e => {
                    this.Logger.error(e)
                    return false
                  })
              } else if (fields[9].value === 'ETH' || fields[9].value === 'LTC') {
                this.Crypto.createWithdrawRequest(
                  fields[0].value,
                  fields[11].value,
                  parseFloat(fields[10].value.replace('$', '')) * 100,
                  fields[9].value.toLowerCase(),
                  true,
                  fields[8].value
                )
                  .then(() => {
                    message.reactions.removeAll()
                    disMessage.author.name = 'Withdrawal APPROVED'
                    disMessage.color = COLORS.Deposit
                    disMessage.addField('Approved By:', user.username)
                    message.edit('', { embed: disMessage })
                    return true
                  })
                  .catch(e => {
                    this.Logger.error(e)
                    return false
                  })
              }
            }
            if (reaction.emoji.name === '⛔' && !user.bot && reaction.count === 2) {
              Transaction.findByIdAndUpdate(message.embeds[0].fields[8].value, {
                status: ETransactionState.Declined,
              })
                .then(() => {
                  message.reactions.removeAll()
                  disMessage.author.name = 'Withdrawal DENIED'
                  disMessage.color = COLORS.Error
                  disMessage.addField('Denied By:', user.username)
                  message.edit('', { embed: disMessage })
                  return true
                })
                .catch(e => {
                  this.Logger.error(e)
                  return false
                })
            }

            return false
          },
          { time: 60e3 * 60 * 48 }
        )
        .catch(this.Logger.error)
    } catch (e) {
      this.Logger.error(e)
      return Promise.reject({ code: ERROR.InternalError, message: 'INTERNAL_ERROR' })
    }
  }

  Notification(title, message, type, fields = []) {
    const Webhook = Webhooks[config.isAppProd() ? type : 'Test']

    Webhook.name = 'SkinWager Notification System'

    try {
      const disMessage = new MessageEmbed({
        author: { name: `${title}` },
        color: COLORS[type] || COLORS.Error,
        description: message,
        timestamp: new Date(),
      })

      if (fields) {
        fields.forEach(field => {
          const { name } = field
          let { value } = field

          if (name === 'Ping') {
            const names = value
            value = ''

            names.forEach(i => {
              value += `${PING_NAMES[i] || i} `
            })
          }

          disMessage.addField(name, value)
        })
      }

      Webhook.send('', {
        embeds: [disMessage],
      })
    } catch (e) {
      this.Logger.error(e)
    }
  }
}
