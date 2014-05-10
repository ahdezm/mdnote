#!/usr/bin/env node

// TODO: Add tag support
// TODO: Add multimarkdown
// TODO: All math in one process
// TODO: Add arguments for math (http://shapeshed.com/command-line-utilities-with-nodejs/)
// TODO: Use Evernote API instead of applescript (http://dev.evernote.com/doc/articles/authentication.php)

var argv = require('yargs')
	.boolean('m')
	.alias('m','meta')
	.describe('m','Strict meta information, must be delimited by a line of hyphens')
	.argv;

var fs = require('fs');
var through = require('through2');
var split = require('split');
var base64 = require("base64-stream");
var math = require("mathmode");

var marked = require('marked');
var applescript = require('applescript');

marked.setOptions({
	renderer: new marked.Renderer(),
	gfm: true,
	tables: true,
	breaks: false,
	pedantic: false,
	sanitize: false,
	smartLists: true,
	smartypants: true
});

var escapeStr = function(str){
	return str.replace(/(?=["\\])/g, '\\');
};

function readFile(path){
	var contents = [];
	var status = false;
	var meta = {
		title:false,
		tags:false,
		book:false
	};

	fs.createReadStream(path).pipe(split()).pipe(through(function(line,enc,done){
		line = line.toString();
		if(/^-+$/.test(line)){
			status = !status;
			done();
			return;
		}

		if(status || !argv.meta){
			if(!meta.title){
				var title = line.match(/^Title:\s(.*)|^#+(.+)/);
				if(!!title){ 
					meta.title = ((!!title && title[2])?(title[2]):(title[1])).trim();
					done();
					return;
				}
			}

			if(!meta.tags){
				var tags = line.match(/^(Tags:|@)\s(.*)/);
				if(!!tags){
					meta.tags = tags[2].split(',').map(function(tag){
						return tag.trim();
					});
					done();
					return;
				}
				
			}
			
			if(!meta.book){
				var book = line.match(/^(Notebook:|=)\s(.*)/);
				if(!!book){
					meta.book = book[2].trim();
					done();
					return;
				}
			}
		}

		if(line.length < 1){ line = '<br>' }
		this.push(line);
		done();
	})).pipe(through(function(line,enc,done){
		var self = this;
		line = line.toString();

		var latex = line.match(/\$\$(.+)\$\$/);
		if(!!latex && latex.length > 0){
			if(argv.loadLatex){
				this.push(line.split(latex[0])[0] + '<img alt="' + latex[1] + '" src="https://chart.googleapis.com/chart?cht=tx&chl=' + encodeURI(latex[1]) + '"></img>' + line.split(latex[0])[1]);
				done();
			} else {
				this.push(line.split(latex[0])[0] + '<img alt="' + latex[1] + '" src="data:image/png;base64,');

				math(latex[1],{dpi:140}).pipe(base64.encode()).on('data',function(data){
					self.push(data);
				}).on('end',function(){
					self.push('"></img>' + line.split(latex[0])[1]);
					done();
				});	
			}
			
		} else {
			this.push(line);
			done();
		}
	})).on('data',function(line){
		contents.push(line);	
	}).on('end',function(){
		createNote(meta,contents.join('\n'));
	});
}

function createNote(meta,contents){
	var html = marked(contents);
	meta.title = meta.title || new Date().toString();

	var script = 'tell application "Evernote" to create note title "' + escapeStr(meta.title) + '"';
	script += ' with html "' + escapeStr(html) +'"';
	script += (!!meta.book)?(' notebook "' + escapeStr(meta.book) + '"'):('');
	// BUG: There appears to be a bug with Evernote App
	/*if(!!meta.tags){
		var tags = (meta.tags.length === 1)? escapeStr(meta.tags[0]): escapeStr('{' + meta.tags.map(function(tag){
			return '"' + tag + '"';
		}) + '}');
		script += ' tags "' + tags + '"';
	}*/
	applescript.execString(script,function(err,data) {
		console.log(err || data);
	});
}

if(argv._.length === 1 && fs.existsSync(argv._[0])){
	readFile(argv._[0]);
}