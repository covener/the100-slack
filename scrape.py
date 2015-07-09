import requests, json, sys, re, moment
from bs4 import BeautifulSoup

dev = True  

gameTitleChannelMap = {
    "Crota's End": "crota-raid",
    "Vault of Glass - Normal Mode": "vog-raid",
    "Prison of Elders": "prison-of-elders",
    "Trials of Osiris": "trials-of-osiris",
    "Weekly Nightfall Strike": "nightfall",
    "Weekly Heroic Strike": "weekly-heroic",
    "Strike Playlist": "strike-playlist",
    "The Shadow Thief": "strike-playlist",
    "The Devil's Lair": "strike-playlist",
    "The Summoning Pits": "strike-playlist",
    "The Nexus": "strike-playlist",
    "Winter's Run": "strike-playlist",
    "Cerberus Vae III": "strike-playlist",
    "Dust Palace": "strike-playlist",
    "The Undying Mind": "strike-playlist",
    "The Will of Crota": "strike-playlist",
    "Story Mission": "up-for-anything",
    "Daily Heroic Story": "daily-heroic",
    "Bounty": "up-for-anything",
    "Patrol": "patrol",
    "Iron Banner": "iron-banner",
    "Crucible": "crucible",
    "Exotic Weapon Bounty": "up-for-anything",
    "Queen's Kill Order": "up-for-anything",
    "Miscellaneous": "up-for-anything"
}

keywordChannelMap = {
    "gorgons? (chest|giveaway)": "gorgon",
    "drunk[- ]raid": "drunk-raids",
    "fatebringer": "fatebringerless",
    "flawless": "flawed-raiders"
}

if len(sys.argv) > 1:
    group = int(sys.argv[1])
elif (dev == True):
    group = 186
else:
    print "You must pass a group ID from the100.io as an argument to this script."
    sys.exit(1)

### Game class

class Game:
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
        return ' '.join(o.find("span", { "class": "badge"}).parent.text.replace('\n', ' ').replace('\r', '').split())

    def parseGameText(self, o):
        return o.find("h4", { "class": "issue-item-text"}).text.lstrip().rstrip()

    ### parsing functions

    def parseGameId(self, o):
        url = self.url if hasattr(self, 'url') else self.parseUrl(o)
        return int(url.rsplit("/")[-1])

    def parseTime(self, o):
        mT = re.search(r"(\d\d):(\d\d) ([A-Z]{2})", self.gameText)
        time = { "hour": mT.group(1), "minute": mT.group(2) }
        if (mT.group(3) == "PM"):
            time['hour'] = str(int(time['hour']) + 12)
        mD = re.search(r"\w{3}, (\d\d-\d\d) [A-Z]{3}", o.find("small").text)
        date = str(moment.now().year) + "-" + str(mD.group(1)) + "T" + time['hour'] + ":" + time['minute'] + ":00" + moment.now().locale("US/Pacific").strftime('%z')
        return date

    def parseStatus(self, o):
        status = o.find("a", { "class": "btn-block"})
        return status.text if (status) else "Over"

    def parseUrl(self, o):
        url = o.find("div", { "class": "project-item-button"}).find('a', text=re.compile(r"View Lobby"), href=True)['href']
        url = "https://www.the100.io" + url
        return url

    def parseTitle(self, o):
        title = re.search(r"\|(.*)", self.gameText).group(1).rstrip().lstrip()
        return title

    def parseRequiredLevel(self, o):
        lvl = re.search(r"lvl (\d+)", self.gameDetails)
        return int(lvl.group(1)) if (lvl) else None

    def parseDescription(self, o):
        description = o.find("h4", { "class": "issue-item-text"}).findNext('p').text.rstrip().lstrip()
        return description

    def parsePlatform(self, o):
        return o.find("span", { "class": "badge"}).text

    def parseMicRequired(self, o):
        mic = re.search(r"mic required", self.gameDetails)
        return True if (mic) else False

    def parsePlayers(self, o):
        players = []
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

cookies = {'auth_token': '6cGH726-PuRCO1AiiEn6Gw'}
r = requests.get('https://www.the100.io/groups/' + str(group) + '/gaming_sessions', cookies=cookies)

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