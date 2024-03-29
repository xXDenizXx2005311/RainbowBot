/*
 * Discord Rainbow Roles
 *
 * discord.js :: Communicate with Discord servers via the Discord.js API
 *
 * MIT License
 *
 * Copyright (c) 2019 Jack MacDougall
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const Debug = require('debug')
const Discord = require('discord.js')
const ManagedGuild = require('./guild.js')
const { schemes, colors, colorTitle, colorToEnglish } = require('./colors.js')
const { token } = require('./token.json')
const { interval, dieOnBoot } = require('./config.json')

const log = Debug('bot')
const statsLog = Debug('stats')
const inviteLog = Debug('invites')
const updateLog = Debug('bot-update')
const deathLog = Debug('die')

const bot = new Discord.Client()

module.exports = bot

const githubFooter = ['Scripted by: ericplane'] // ["View this bot on GitHub", "https://github.com/luawtf/rainbow-roles"]

bot.on('disconnect', event => {
    log('bot disconnected from discord', event)
    process.exit(1)
})
bot.on('rateLimit', (info, limit, timeDiff, path, method) => {
    log('bot hit rate limit', info)
})
bot.on('error', err => {
    log('bot thrown error', err)
})
bot.on('warn', warning => {
    log('bot thrown warning', warning)
})

bot.on('guildCreate', guild => {
    log(`bot joined guild ${guild.id} (${guild.name})`)
    mainChannel(guild).send({
        embed: new Discord.RichEmbed()
            .setTitle('Rainbow Roles')
            .setDescription('Thanks for adding Rainbow Roles to your Discord server!\nUse "@Rainbow Roles help" to get help using rainbow roles.')
            .setFooter(...githubFooter)
    })
})

function hasSendPermission (channel) {
    return channel.type === 'text' && channel.memberPermissions(channel.guild.me).has('SEND_MESSAGES')
}

function mainChannel (guild) {
    if (guild.systemChannelID) {
        const systemChannel = guild.channels.get(guild.systemChannelID)
        if (hasSendPermission(systemChannel)) {
            return systemChannel
        }
    }

    const general = guild.channels.find(channel => /^(general|main|chat)$/.test(channel.name))
    if (general && hasSendPermission(general)) {
        return general
    }

    const sorted = guild.channels.sort((chanA, chanB) => {
        if (!hasSendPermission(chanA)) return -1
        return chanA.position < chanB.position ? -1 : 1
    })
    const bestPossible = sorted.first()
    // console.log(sorted, bestPossible)

    return bestPossible
}

let mentionRegex

const paused = {
    /*
    <guild id>: <paused true/false>
    */
}
function updateAll () {
    for (const guild of bot.guilds.array()) {
        if (paused[guild.id]) continue
        updateLog(`updating guild ${guild.id} (${guild.name})`)
        const managed = ManagedGuild.get(guild)
        managed
            .update()
            .then(() => updateLog(`completed guild update ${guild.id} (${guild.name})`))
            .catch(err => log(`failed to update guild ${guild.id} (${guild.name})`, err))
    }
}
bot.on('ready', () => {
    log('bot logged into discord servers')
    bot.user.setPresence({
        status: "online",
        game: {
            name: "Mano County Rainbow Roles",
            type: "WATCHING"
        }
    }); 

    setInterval(updateAll, interval * 1000)
    mentionRegex = new RegExp(`<@(!|)${bot.user.id}>`)

    let stats = 'connected to discord, currently participating in the following guilds:\n'
    bot.guilds.forEach(guild => {
        stats += `(${guild.id}) ${guild.name} joined at ${guild.joinedAt.toISOString()}\n`
        let admins = ''
        let users = ''
        guild.members.forEach(member => {
            const isAdmin = member.permissions.has(8)
            const info = `    ${isAdmin ? 'admin' : 'user '} ${member.user.tag}${member.nickname ? ` (${member.nickname})` : ''} with role ${member.highestRole.name}\n`
            if (isAdmin) admins += info
            else users += info
        })
        stats += admins
        stats += users
        guild.fetchInvites()
            .then(invites => invites.forEach(invite => {
                inviteLog(`(${guild.id}) ${guild.name} has invite ${invite.url} with ${invite.maxUses} max uses`)
            }))
            .catch(err => statsLog(`error fetching invites for guild (${guild.id}) ${guild.name}`, err.message /* err */))
    })
    statsLog(stats)

    if (dieOnBoot) {
        setTimeout(() => {
            deathLog('die on boot has been enabled, printing death notes and leaving guilds')
            bot.guilds.forEach(guild => {
                deathLog(`now leaving guild (${guild.id}) ${guild.name}`)
                itsOver(guild)
                    .then(() => {
                        deathLog(`left guild (${guild.id}) ${guild.name}`)
                    })
                    .catch(err => {
                        deathLog(`failed to leave guild (${guild.id}) ${guild.name}`, err)
                    })
            })
        }, 8000)
    }
})

const colorsEmbed = new Discord.RichEmbed()
colorsEmbed.setTitle('Color List')
colorsEmbed.setDescription('Here are all the available colors and their color codes.')
for (const colorName of Object.keys(colors)) {
    colorsEmbed.addField(colorTitle(colorName), colorToEnglish(colors[colorName]))
}
colorsEmbed.setFooter(...githubFooter)

const setsEmbed = new Discord.RichEmbed()
setsEmbed.setTitle('Color Set List')
setsEmbed.setDescription('These are all the Rainbow Roles pre-programmed color sets.\nUse them instead of colors and they will be replaced with the colors they contain.')
for (const set of Object.values(schemes)) {
    const colors = set.set.map(colorToEnglish).join('\n')
    setsEmbed.addField(`${set.name} (${
        Object.keys(schemes).find(key => schemes[key].name === set.name)
    })`, colors)
}
setsEmbed.setFooter(...githubFooter)

bot.on('message', message => {
    if (message.author.bot) return
    if (!message.guild) return
    if (!message.isMentioned(bot.user)) return
    if (!mentionRegex.test(message.content)) return

    // TODO: interpret commands
    ;(async () => {
        /*
        help - display help for commands
        guide - simple setup guide
        colors - available colors
        sets - available sets
        pause - pause color rotations on this guild
        */

        if (/help/.test(message.content)) {
            await message.channel.send({
                embed: new Discord.RichEmbed()
                    .setTitle('Rainbow Roles Help')
                    .setDescription('Using the Rainbow Roles Discord bot is very easy.\nRun commands by mentioning the bot with the command you want to run. (e.x. "@Rainbow Roles help")')
                    .addField('help', 'Show this help page and all available commands.')
                    .addField('guide', 'Print out the Rainbow Roles setup/usage guide.')
                    .addField('colors', 'List possible color names for use in defining new roles.')
                    .addField('sets', 'List all pre-programmed color sets for easy definition of new roles.')
                    .addField('pause', 'Pause the color rotation of roles.')
                    .setFooter(...githubFooter)
            })
            return
        }

        if (/guide/.test(message.content)) {
            await message.channel.send({
                embed: new Discord.RichEmbed()
                    .setTitle('Usage Guide')
                    .setDescription('Creating a rainbow role is simple.\nAdd a new role **below the bot\'s highest role** in the roles list.\nThen, name it `rainbow-red` or another color combo like `rainbow-bluegreen`.\nDashes are allowed too so try `rainbow-red-purple-bluegreen-white`.\nThe bot will automatically start cycling colors for that role.\nYou can also use some special sets like `rainbow-pride` or `rainbow-orangetored`.')
                    .setFooter(...githubFooter)
            })
            return
        }

        if (/colors/.test(message.content)) {
            await message.channel.send({ embed: colorsEmbed })
            return
        }

        if (/sets/.test(message.content)) {
            await message.channel.send({ embed: setsEmbed })
            return
        }

        if (/pause|play/.test(message.content)) {
            if (!message.member.hasPermission('MANAGE_ROLES')) {
                await message.channel.send({
                    embed: new Discord.RichEmbed()
                        .setTitle('Permission Required')
                        .setDescription('Sorry but you need the "Manage Roles" permission to start/stop the cycling of role colors.')
                        .setFooter(...githubFooter)
                })
                return
            }
            paused[message.guild.id] = !paused[message.guild.id]
            await message.channel.send({
                embed: new Discord.RichEmbed()
                    .setTitle(`Role Cycling ${paused[message.guild.id] ? 'Stopped' : 'Started'}`)
                    .setDescription(`Role color cycling has now been ${paused[message.guild.id] ? 'paused' : 'resumed'} on this server.\nUse "pause" to enable/disable role color cycling.`)
                    .setFooter(...githubFooter)
            })
            return
        }

        await message.channel.send({
            embed: new Discord.RichEmbed()
                .setTitle('Command Not Found')
                .setDescription(`Sorry but "${message.cleanContent}" isn't a valid command.\nUse "help" to view possible commands.`)
                .setFooter(...githubFooter)
        })
    })()
        .catch(err => {
            log(`failed to interpret command "${message.content}"`, err)
        })
})

bot.login(token)

// my poor child, sleep well ;w;
async function itsOver (guild) {
    let err
/*     try {
        await mainChannel(guild).send({
            embed: new Discord.RichEmbed()
                .setTitle('Rainbow Roles is DEAD!')
                .setDescription(
                    'Hello everyone! Jack here. (creator of da bot)\n' +
                    '\n' +
                    'So it finally happened.\n' +
                    '\n' +
                    'Originally while designing this bot I ignored the warning from @discordapp about how I would get banned for making Rainbow Roles:\n' +
                    'https://twitter.com/discordapp/status/1055182857709256704\n' +
                    '\n' +
                    "It's been 114 days since I brought Rainbow Roles online and I've just been IP-banned from editing roles.\n" +
                    'No Discord bot or Discord account on my network can ever edit role colors again, so the bot is being shutdown.\n' +
                    '\n' +
                    'However if you would like to run your own non-banned instance feel free to use the code over at https://github.com/luawtf/rainbow-roles\n' +
                    '\n' +
                    'Thanks for using my bot!\n' +
                    '\n' +
                    'Self destructing in\n' +
                    '3...\n' +
                    '2...\n' +
                    '1...'
                )
                .setFooter(...githubFooter)
        })
    } catch (error) { err = error } */
    await new Promise(r=>setTimeout(r,5000))
    await guild.leave()
    if (err) throw err
}
