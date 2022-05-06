

Twingate CLI Tool
===========================
This is a command line application demonstrating various usages of the Twingate API.

Setup
===========================
* Download the lastest release cli-{version}-{os}-{cpu architecture}.zip from https://github.com/Twingate-Labs/tg-cli/releases/latest<br />
* Unzip the downloaded zip file

Windows
===========================
* Open Command Prompt
* ```\path\to\tg.exe --help``` e.g. ```G:\tg.exe --help```


**Setup**
1. Obtain an API key from the Twingate Admin Console with at least read and write permissions
2. Install [Deno](https://deno.land/#installation) for your platform.
3. At the terminal execute ``./tg.js``.

**Compilation**

This script can be compiled to a native executable binary using `deno compile --allow-all --import-map ./import_map.json --unstable ./tg.js`

Thereafter you can execute the binary without deno: ``./tg --help``

**Example - Show command usage**

``./tg.js --help``

``./tg.js group --help``

``./tg.js export --help``

**Example - Export Excel file**

``./tg.js export``

**Example - Export PNG image**

``./tg.js export --format png``

*Note: Requires the [GraphViz](https://graphviz.gitlab.io) package to be [installed](https://graphviz.gitlab.io/download/#executable-packages) and available on your path.*

**Example - List resources**

``./tg.js resource list``


**Example - Import Groups, Remote Networks and resources into a new account**

``./tg.js import -a [new account name] -nrg -f [path to file to import from (format must be as outputted by the export command)]``
