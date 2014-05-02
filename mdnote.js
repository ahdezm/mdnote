#!/usr/bin/env node

// TODO: Add tag support
// TODO: Add multimarkdown
// TODO: Add math support using streams
// TODO: Use Evernote API instead of applescript

var argv = require('yargs').argv;

var fs = require('fs');
var split = require('split');
var base64 = require("base64-stream");
var math = require("mathmode");

var marked = require('marked');
var applescript = require('applescript');

marked.setOptions({
	renderer: new marked.Renderer(),
	gfm: true,
	tables: true,
	breaks: true,
	pedantic: false,
	sanitize: false,
	smartLists: true,
	smartypants: true
});

var escapeStr = function(str){
	return str.replace(/(?=["\\])/g, '\\');
};

var math2url = function(latex,done){
	var data = 'data:image/png;base64,';
	math(latex).pipe(base64.encode()).on('data',function(chunk){
		data += chunk;
	}).on('end',function(){
		done(null,data);
	}).on('error',function(err){
		done(err);
	});
};

function readFile(path){
	var contents = '';
	var status = false;
	var meta = {
		title:false,
		tags:false,
		book:false
	};

	fs.createReadStream(path).pipe(split()).on('data',function(line){
		if(/^-+$/.test(line)){
			status = !status;
			return;
		}

		if(status){
			if(!meta.title){
				var title = line.match(/^Title:\s(.*)|^#+(.+)/);
				if(!!title){ 
					meta.title = ((!!title && title[2])?(title[2]):(title[1])).trim();
					return;
				}
			}

			if(!meta.tags){
				var tags = line.match(/^(Tags:|@)\s(.*)/);
				if(!!tags){
					meta.tags = tags[2].split(',').map(function(tag){
						return tag.trim();
					});
					return;
				}
				
			}
			
			if(!meta.book){
				var book = line.match(/^(Notebook:|=)\s(.*)/);
				if(!!book){
					meta.book = book[2].trim();
					return;
				}
			}
		}

		contents += line + '\n';
	}).on('end',function(){
		createNote(meta,contents);
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