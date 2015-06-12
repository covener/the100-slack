import requests, json, sys, re, moment
from bs4 import BeautifulSoup

class Game:
    def __init__(self):
        self.time = ""
        self.status = ""
        self.url = ""
        self.name = ""
        self.requiredLevel = ""
        self.description = ""
        self.platform = ""
        self.isMicRequired = True
        self.players = []

    def addPlayer(self, x):
        self.players.append(x)

def parseTime(o):
    mT = re.search(r"(\d\d):(\d\d) ([A-Z]{2})", o.find("h4", { "class": "issue-item-text"}).text)
    time = { "hour": mT.group(1), "minute": mT.group(2) }
    if (mT.group(3) == "PM"):
        time['hour'] = str(int(time['hour']) + 12)
    mD = re.search(r"\w{3}, (\d\d-\d\d) [A-Z]{3}", o.find("small").text)
    date = str(moment.now().year) + "-" + str(mD.group(1)) + "T" + time['hour'] + ":" + time['minute'] + ":00"
    return date

def parseStatus(o):
    status = o.find("a", { "class": "btn-block"})
    if (status):
        return status.text
    else:
        return "Over"

def parseUrl(o):
    url = o.find("div", { "class": "project-item-button"}).find('a', text=re.compile(r"View Lobby"), href=True)['href']
    url = "https://www.the100.io" + url
    return url

def parseName(o):
    name = o.find("h4", { "class": "issue-item-text"}).text
    name = re.search(r"\|(.*)", name).group(1).rstrip().lstrip()
    return name

def parseRequiredLevel(o):
    lvl = o.find("span", { "class": "badge"}).parent.text
    lvl = re.search(r"lvl (\d+)", lvl, re.M)
    if (lvl): return int(lvl.group(1))
    return None

def parseDescription(o):
    description = o.find("h4", { "class": "issue-item-text"}).findNext('p').text.rstrip().lstrip()
    return description

def parsePlatform(o):
    badge = o.find("span", { "class": "badge"}).text
    return badge

def parseMicRequired(o):
    mic = o.find("span", { "class": "badge"}).parent.text
    mic = re.search(r"mic required", mic, re.M)
    if (mic):
        return True
    else:
        return False

def parsePlayers(o):
    players = []
    for player in o.find("h4", { "class": "issue-item-text"}).parent.findAll('a', href=True):
        players.append({"name": player.text, "url": "https://www.the100.io" + player['href']})
    return players

r = requests.get('https://www.the100.io/groups/186/gaming_sessions')

html = r.text.encode('utf-8')
soup = BeautifulSoup(html)

api = {}
api['games'] = []

for o in soup.findAll("div", { "class": "issue-item" }):
    game = Game()
    game.time = parseTime(o)
    game.status = parseStatus(o)
    game.url = parseUrl(o)
    game.name = parseName(o)
    game.requiredLevel = parseRequiredLevel(o)
    game.description = parseDescription(o)
    game.platform = parsePlatform(o)
    game.isMicRequired = parseMicRequired(o)
    game.players = parsePlayers(o)
    api['games'].append(game.__dict__)

print json.dumps(api, sort_keys=True, indent=4)