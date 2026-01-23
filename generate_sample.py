#!/usr/bin/env python3
import random

def gaussian_clamp(mean=10, std=10, min_val=0, max_val=60):
    val = random.gauss(mean, std)
    return max(min_val, min(max_val, int(round(val))))

def generate_name(is_warrior):
    if is_warrior:
        prefixes = ["Thunder", "Blood", "Iron", "Storm", "Shadow", "Frost", "Fire", "Dragon", "Steel", "Night"]
        suffixes = ["strike", "axe", "blade", "heart", "fury", "guard", "lord", "bane", "rage", "claw"]
        return random.choice(prefixes) + random.choice(suffixes)
    else:
        names = ["John", "Jane", "Alex", "Sam", "Chris", "Pat", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Blake", "Cameron", "Drew", "Ellis", "Finley", "Gabe", "Hayden", "Jamie", "Kendall", "Logan", "Micah", "Noel", "Parker", "Quinn", "Reese", "Sage", "Tanner", "Umber", "Vance", "Wren", "Xander", "Yara", "Zane", "Brooks", "Carter", "Dakota", "Emerson", "Frankie", "Greyson", "Harper", "Indigo", "Jasper", "Kylie", "Lennox", "Madison", "Nolan", "Oakley", "Piper", "Rowan", "Skylar", "Tristan", "Ulysses", "Violet", "Wyatt", "Xanthe", "Yosef", "Zara"]
        return random.choice(names)

def generate_used_for():
    options = ["Soldier Training", "Construction", "Research"]
    num_choices = random.choices([1, 2, 3], weights=[0.4, 0.4, 0.2])[0]
    if num_choices == 3:
        selected = options
    else:
        selected = random.sample(options, num_choices)
    return ",".join(selected)

def generate_time():
    hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    return f"{hour:02d}:{minute:02d}"

def generate_all_times():
    # Simple random ranges, e.g., "00:00-12:00,18:00-23:59"
    start1 = generate_time()
    end1 = generate_time()
    start2 = generate_time()
    end2 = generate_time()
    return f"{start1}-{end1},{start2}-{end2}"

def main():
    alliances = ["WAR", "MAG", "ELF", "DWA", "ORC", "HUM", "ROG", "PAL"]
    alliance_cycle = alliances * (100 // len(alliances)) + alliances[:100 % len(alliances)]
    random.shuffle(alliance_cycle)
    
    names = set()
    for _ in range(100):
        is_warrior = random.random() < 0.5  # 50% chance
        name = generate_name(is_warrior)
        while name in names:
            name = generate_name(is_warrior)
        names.add(name)
    
    name_list = list(names)
    random.shuffle(name_list)
    
    start_id = 14
    for i in range(100):
        id_str = f"{start_id + i:05d}"
        name = name_list[i]
        alliance = alliance_cycle[i]
        speedup = gaussian_clamp()
        used_for = generate_used_for()
        gold = random.randint(1, 20)
        start_time = generate_time()
        end_time = generate_time()
        all_times = generate_all_times()
        
        print(f"{id_str}|\t{name}\t{alliance}\t{speedup}\t{used_for}\t0\t0\t0\t{gold}\t{start_time}\t{end_time}\t{all_times}")

if __name__ == "__main__":
    main()