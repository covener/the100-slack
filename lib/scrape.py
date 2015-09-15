import requests, json, sys, re, moment
from bs4 import BeautifulSoup
from copy import copy


gameTitleChannelMap = {}
keywordChannelMap = {}


### Game class

class Game(object):
    def __init__(self, o):
        self.gameDetails = self.parseGameDetails(o)
        self.gameText = self.parseGameText(o)
        self.time = self.parseTime(o)
        self.status = self.parseStatus(o)
        self.url = self.parseUrl(o)
        self.title = self.parseTitle(o)
        self.requiredLevel = self.parseRequiredLevel(o)
        self.description = self.parseDescription(o)
        self.platform = self.parsePlatform(o)
        self.isMicRequired = self.parseMicRequired(o)
        self.players = self.parsePlayers(o)
        self.host = self.parseHost(o)
        self.partySize = self.parsePartySize(o)
        self.maxPlayers = self.parseMaxPlayers(o)
        self.gameId = self.parseGameId(o)
        self.groupId = group
        self.channels = self.parseChannels(o)

    ### class utilities

    def addPlayer(self, player):
        self.players.append(player)

    ### internal functions

    def parseGameDetails(self, o):
        details = ' '.join(o.find("span", { "class": "badge"}).parent.text.replace('\n', ' ').replace('\r', '').split())
        if (len(details) == 3):
            for li in o.find("ul", {"class": "game-details-list"}).findAll('li'):
                details += li.text
            details = ' '.join(details.replace('\n', ' ').replace('\r', '').split())
        return details

    def parseGameText(self, o):
        try:
            gameText = o.find("h2", { "class": "issue-item-text"}).text.strip()
        except:
            gameText = o.find("h4", { "class": "issue-item-text"}).text.strip()
        # print gameText
        return gameText

    ### parsing functions

    def parseGameId(self, o):
        url = self.url if hasattr(self, 'url') else self.parseUrl(o)
        return int(url.rsplit("/")[-1])

    def parseTime(self, o):
        mT = re.search(r"(\d\d):(\d\d) ([A-Z]{2})", self.gameText)
        time = { "hour": mT.group(1), "minute": mT.group(2) }
        if (mT.group(3) == "PM"):
            time['hour'] = str(int(time['hour']) + 12)
        if (o.find("ul", {"class": "game-details-list"}) == None):
            mD = re.search(r"\w{3}, (\d\d)-(\d\d) [A-Z]{3}", o.find("small").text)
        else:
            mD = re.search(r"\w{3}, (\d\d)/(\d\d) [A-Z]{3}", o.find("ul", {"class": "game-details-list"}).findNext("li").text)
        date = str(moment.now().year) + "-" + str(mD.group(1)) + "-" + str(mD.group(2)) + "T" + time['hour'] + ":" + time['minute'] + ":00" + moment.now().locale("US/Pacific").strftime('%z')
        # print date
        return date

    def parseStatus(self, o):
        status = o.find("a", { "class": "btn-block"})
        if (status == None):
            status = o.find("button", {"class": "btn-block"})
        return status.text.strip() if (status) else "Over"

    def parseUrl(self, o):
        if (o.find("a", { "class": "game-title"}) == None):
            url = o.find("div", { "class": "project-item-button"}).find('a', text=re.compile(r"View Lobby"), href=True)['href']
        else:
            url = o.find("a", { "class": "game-title"})['href']
        url = "https://www.the100.io" + url
        # print url
        return url

    def parseTitle(self, o):
        title = re.search(r"[\n|](.*)", self.gameText).group(1).strip()
        return title

    def parseRequiredLevel(self, o):
        lvl = re.search(r"(?:lvl|level) (\d+)", self.gameDetails, re.I)
        return int(lvl.group(1)) if (lvl) else None

    def parseDescription(self, o):
        try:
            description = o.find("h2", { "class": "issue-item-text"}).findNext('p').text.strip()
        except:
            description = o.find("h4", { "class": "issue-item-text"}).findNext('p').text.strip()
        return description

    def parsePlatform(self, o):
        return o.find("span", { "class": "badge"}).text

    def parseMicRequired(self, o):
        mic = re.search(r"mic required", self.gameDetails, re.I)
        return True if (mic) else False

    def parsePlayers(self, o):
        players = []
        if (o.find("div", { "class": "game-player-sessions"}) != None):
            for player in o.find("div", { "class": "game-player-sessions"}).findAll('a', href=True):
                players.append({"name": player.text, "url": "https://www.the100.io" + player['href']})
        if (len(players) == 0):
            for player in o.find("h4", { "class": "issue-item-text"}).parent.findAll('a', href=True):
                players.append({"name": player.text, "url": "https://www.the100.io" + player['href']})
        return players

    def parseHost(self, o):
        if (len(self.players) > 0):
            return self.players[0]  
        elif (len(self.parsePlayers(o)) > 0):
            return self.parsePlayers(o)[0]
        else:
            return {}

    def parsePartySize(self, o):
        partySize = re.search(r"(\d+) players? / \d+", self.gameDetails)
        return int(partySize.group(1)) if (partySize) else 0

    def parseMaxPlayers(self, o):
        maxPlayers = re.search(r"\d+ players? / (\d+)", self.gameDetails)
        return int(maxPlayers.group(1)) if (maxPlayers) else 0

    def parseChannels(self, o):
        channels = []
        for key, value in gameTitleChannelMap.iteritems():
            m = re.search(key, self.title, re.I)
            if (m):
                channels.append(value)
                break

        for key, value in keywordChannelMap.iteritems():
            m = re.search(key, self.description, re.I)
            if (m):
                channels.append(value)
        return channels


### main

if __name__ == '__main__':

    if len(sys.argv) > 1:
        groupId = sys.argv[1]
        group = int(groupId)
    else:
        print "You must pass a group ID from the100.io as an argument to this script."
        sys.exit(1)

    import os, sys
    dirname, filename = os.path.split(os.path.abspath(sys.argv[0]))
    globalConfig = json.loads(file(os.path.join(dirname, '../config/config.json')).read())

    groupConfig = globalConfig["groups"][groupId]

    gameTitleChannelMap = copy(globalConfig["defaultMaps"]["gameTitleChannelMap"])
    if "gameTitleChannelMap" in groupConfig:
        gameTitleChannelMap.update(groupConfig["gameTitleChannelMap"])

    keywordChannelMap = copy(globalConfig["defaultMaps"]["keywordChannelMap"])
    if "keywordChannelMap" in groupConfig:
        keywordChannelMap.update(groupConfig["keywordChannelMap"])

    cookies = {'auth_token': groupConfig['authToken']}
    r = requests.get('https://www.the100.io/groups/' + groupId + '/gaming_sessions', cookies=cookies)

    html = r.text.encode('utf-8')
    soup = BeautifulSoup(html)

    api = {}
    api['games'] = []

    for o in soup.findAll("div", { "class": "issue-item" }):
        game = Game(o).__dict__
        game.pop("gameDetails", None)
        game.pop("gameText", None)
        api['games'].append(game)

    print json.dumps(api, sort_keys=True, indent=4)
