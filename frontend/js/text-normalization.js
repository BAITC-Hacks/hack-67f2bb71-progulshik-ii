/* Align frontend placeholders with backend/interview.js. Keep model quality
 * metadata and validation from the current application unchanged. */
(function(S){
  'use strict';
  const unknown=new Set(['tbd','todo','n/a','na','unknown','not specified','not known','не знаю','пока не знаю','неизвестно','пока неизвестно','не указано','не определено','пока не определено','нет данных','информации нет','нет информации','уточню','нужно уточнить','будет позже']);
  S.model.meaningful=function(value){
    const text=typeof value==='string'?value.normalize('NFKC').toLocaleLowerCase('ru').replace(/[\u200B-\u200D\uFEFF]/gu,'').replace(/ё/gu,'е').replace(/\s+/gu,' ').trim().replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu,''):'';
    return /[\p{L}\p{N}]/u.test(text)&&!unknown.has(text);
  };
})(window.Sana);
