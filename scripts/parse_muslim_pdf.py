import pdfplumber
import json
import re

def clean_footnotes(text):
    """Удаляет сноски (цифры в верхнем индексе)"""
    # Убираем текст после сносок типа ²⁵, ²⁶
    text = re.sub(r'[\u2070-\u209F]+.*?(?=\n|$)', '', text, flags=re.DOTALL)
    return text

def parse_muslim_pdf(pdf_path, output_path):
    hadiths = []
    current_book = None
    current_chapter = None
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"📄 Всего страниц: {len(pdf.pages)}")
        
        full_text = ""
        for i, page in enumerate(pdf.pages):
            print(f"Обработка страницы {i+1}/{len(pdf.pages)}...", end='\r')
            full_text += page.extract_text() + "\n"
        
        print(f"\n✅ Текст извлечён ({len(full_text)} символов)")
        
        # Удаляем сноски
        full_text = clean_footnotes(full_text)
        
        lines = full_text.split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Определяем книгу
            book_match = re.match(r'^(\d+)\.\s*КНИГА\s+(.+)$', line, re.IGNORECASE)
            if book_match:
                current_book = f"{book_match.group(1)}. {book_match.group(2)}"
                print(f"\n📚 Книга: {current_book}")
                i += 1
                continue
            
            # Определяем главу
            chapter_match = re.match(r'^Глава\s+(\d+)\.(.+)$', line, re.IGNORECASE)
            if chapter_match:
                current_chapter = f"Глава {chapter_match.group(1)}.{chapter_match.group(2)}"
                i += 1
                continue
            
            # Ищем номер хадиса (просто цифра в начале строки)
            hadith_match = re.match(r'^(\d+)\s*$', line)
            if hadith_match:
                hadith_id = int(hadith_match.group(1))
                
                # Собираем текст хадиса (до следующего номера или конца)
                hadith_text = []
                i += 1
                
                while i < len(lines):
                    next_line = lines[i].strip()
                    
                    # Проверяем, не начался ли новый хадис/книга/глава
                    if (re.match(r'^(\d+)\s*$', next_line) or 
                        re.match(r'^\d+\.\s*КНИГА', next_line, re.IGNORECASE) or
                        re.match(r'^Глава\s+\d+', next_line, re.IGNORECASE)):
                        break
                    
                    # Пропускаем служебные строки
                    if next_line and not next_line.startswith('дил'):
                        hadith_text.append(next_line)
                    
                    i += 1
                
                if hadith_text:
                    hadiths.append({
                        'id': hadith_id,
                        'text': ' '.join(hadith_text),
                        'book': current_book,
                        'chapter': current_chapter
                    })
                    
                    if hadith_id % 100 == 0:
                        print(f"📖 Обработано хадисов: {len(hadiths)} (последний ID: {hadith_id})")
                
                continue
            
            i += 1
    
    # Сохраняем результат
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(hadiths),
            'hadiths': hadiths
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n🎉 ГОТОВО!")
    print(f"📊 Всего хадисов: {len(hadiths)}")
    print(f"💾 Сохранено в: {output_path}")
    
    # Статистика
    ids = sorted([h['id'] for h in hadiths])
    min_id = min(ids)
    max_id = max(ids)
    total_found = len(ids)
    expected_range = max_id - min_id + 1
    gaps_count = expected_range - total_found
    coverage = (total_found / expected_range) * 100
    
    print(f"📈 Диапазон ID: {min_id} - {max_id}")
    print(f"📊 Найдено хадисов: {total_found} из {expected_range} возможных ({coverage:.1f}% покрытие)")
    
    # Показываем первые пропущенные ID для примера
    if gaps_count > 0:
        gaps_sample = []
        count = 0
        for expected_id in range(min_id, max_id + 1):
            if expected_id not in ids:
                gaps_sample.append(expected_id)
                count += 1
                if count >= 30:
                    break
        
        print(f"⚠️  Пропущенные ID (первые 30): {gaps_sample}...")
        print(f"   Всего пропущено: {gaps_count} ID")
        print(f"ℹ️  Примечание: Это сокращенная версия (Мухтасар), пропуски - это норма!")
    else:
        print("✅ Все ID в диапазоне найдены!")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Использование: python parse_muslim_pdf.py <путь_к_pdf>")
        print("Пример: python parse_muslim_pdf.py data/muslim.pdf")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_path = pdf_path.replace('.pdf', '_parsed.json')
    
    parse_muslim_pdf(pdf_path, output_path)